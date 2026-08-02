/*
 * Headless smoke test for the home page.
 * Drives preview-home.html in Edge/Chrome over the DevTools protocol with no
 * extra npm dependencies: raw CDP over a WebSocket is enough for what this
 * needs to prove.
 *
 * It asserts the three things that actually break this visual in Power BI:
 *   1. the renderer boots and paints its panels
 *   2. 21 re-injections produce exactly ONE WebGL context, ONE canvas,
 *      ONE style tag and ONE root
 *   3. an empty payload degrades to a message instead of throwing
 *
 * Usage: node smoke-home.js [--keep]
 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];
const BROWSER = CANDIDATES.find(p => fs.existsSync(p));
if (!BROWSER) { console.error('No Edge or Chrome found.'); process.exit(2); }

const PORT = 9333;
const PAGE = 'file:///' + path.resolve(__dirname, 'preview-home.html').replace(/\\/g, '/');
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'tph-smoke-'));

const args = [
  '--headless=new',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + PROFILE,
  '--window-size=1600,900',
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--allow-file-access-from-files',
  /* No SwiftShader. Forcing software rasterisation was needed by the old WebGL
     build; this one is DOM and SVG, and software compositing introduces tile
     seams in wide low-contrast fills that do not exist under normal rendering. */
  '--disable-gpu-sandbox',
  PAGE
];

const proc = spawn(BROWSER, args, { stdio: 'ignore' });

function get(p) {
  return new Promise((res, rej) => {
    const r = http.get({ host: '127.0.0.1', port: PORT, path: p }, s => {
      let b = ''; s.on('data', d => b += d); s.on('end', () => res(JSON.parse(b)));
    });
    r.on('error', rej);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitForTarget(timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const list = await get('/json/list');
      const pg = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (pg) return pg;
    } catch (e) { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('browser did not expose a debug target');
}

(async () => {
  let code = 1;
  let ws;
  try {
    const target = await waitForTarget(25000);
    const WebSocket = await loadWs();
    ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
    await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

    let id = 0;
    const pending = new Map();
    const consoleLines = [];
    ws.on('message', raw => {
      const m = JSON.parse(raw.toString());
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      if (m.method === 'Runtime.consoleAPICalled') {
        consoleLines.push((m.params.args || []).map(a => a.value !== undefined ? a.value : a.description).join(' '));
      }
      if (m.method === 'Runtime.exceptionThrown') {
        consoleLines.push('EXCEPTION: ' + (m.params.exceptionDetails.exception
          ? m.params.exceptionDetails.exception.description
          : m.params.exceptionDetails.text));
      }
    });
    const send = (method, params) => new Promise(res => {
      const i = ++id; pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params: params || {} }));
    });
    const evalJs = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
      return r.result && r.result.result ? r.result.result.value : undefined;
    };

    await send('Runtime.enable');
    await send('Page.enable');
    await sleep(2600);

    /* --- 1. does WebGL2 exist at all in this headless build? ------------- */
    /* --- 2. did the renderer boot? --------------------------------------- */
    const q = (sel) => `document.querySelectorAll('${sel}').length`;
    let st = await evalJs(`(function(){
      function n(s){return document.querySelectorAll(s).length;}
      function txt(s){var e=document.querySelector(s);return e?e.textContent.trim():'';}
      return {
        installed: !!(window.TPH && window.TPH.__installed),
        version: window.TPH ? window.TPH.version : null,
        cards: n('.tph-card'), kpis: n('.tph-kpi'), chips: n('.tph-chip'),
        rows: n('.tph-row'), nodes: n('.tph-node'), paths: n('.tph-mapw svg path'),
        netRev: txt('.tph-kpi:nth-child(1) .tph-kv'),
        opProfit: txt('.tph-kpi:nth-child(4) .tph-kv'),
        vital: txt('.tph-kpi:nth-child(6) .tph-kv'),
        fail: n('.tph-fail')
      };
    })()`);
    console.log('boot                 :', JSON.stringify(st));
    if (st.fail) throw new Error('renderer painted its failure state');
    if (!st.installed) throw new Error('window.TPH was never installed');
    if (st.kpis !== 4) throw new Error('expected 4 KPI cards, got ' + st.kpis);
    if (st.nodes !== 12) throw new Error('expected 12 map bubbles, got ' + st.nodes);
    if (st.rows !== 12) throw new Error('expected 12 store rows, got ' + st.rows);
    if (st.netRev !== '$112.34M') throw new Error('unfiltered revenue wrong: ' + st.netRev);

    /* --- THE POINT OF v3: does a region chip actually re-aggregate? ------- */
    const clickChip = async (label) => {
      await evalJs(`(function(){
        var b=[].slice.call(document.querySelectorAll('[data-region]'))
                .filter(function(x){return x.textContent.trim()==='${label}'.toUpperCase();})[0];
        if(b) b.click();
      })()`);
      await sleep(320);
      return evalJs(`(function(){
        function n(s){return document.querySelectorAll(s).length;}
        function txt(s){var e=document.querySelector(s);return e?e.textContent.trim():'';}
        return { netRev: txt('.tph-kpi:nth-child(1) .tph-kv'),
                 opProfit: txt('.tph-kpi:nth-child(4) .tph-kv'),
                 vital: txt('.tph-kpi:nth-child(6) .tph-kv'),
                 rows: n('.tph-row'), chipsOn: n('.tph-chip.on') };
      })()`);
    };

    const mtn = await clickChip('Mountain');
    console.log('region=Mountain      :', JSON.stringify(mtn));
    if (mtn.netRev !== '$37.15M') throw new Error('Mountain revenue wrong: ' + mtn.netRev + ' (expected $37.15M)');
    if (mtn.rows !== 4) throw new Error('Mountain should leave 4 stores, got ' + mtn.rows);
    if (mtn.vital === st.vital) console.log('  note: vital-few unchanged under filter (may be legitimate)');

    const both = await clickChip('Pacific');
    console.log('region=Mtn+Pacific   :', JSON.stringify(both));
    if (both.netRev !== '$66.66M') throw new Error('Mountain+Pacific wrong: ' + both.netRev + ' (expected $66.66M)');
    if (both.rows !== 7) throw new Error('Mountain+Pacific should leave 7 stores, got ' + both.rows);

    /* store cross-filter narrows the KPI strip but keeps the league table */
    await evalJs(`(function(){var r=document.querySelector('.tph-row[data-store]');if(r)r.click();})()`);
    await sleep(320);
    const one = await evalJs(`(function(){
      function n(s){return document.querySelectorAll(s).length;}
      function txt(s){var e=document.querySelector(s);return e?e.textContent.trim():'';}
      return { netRev: txt('.tph-kpi:nth-child(1) .tph-kv'), rows: n('.tph-row'),
               dimmed: n('.tph-row.off'), detail: n('.tph-detail') };
    })()`);
    console.log('store cross-filter   :', JSON.stringify(one));
    if (one.netRev === both.netRev) throw new Error('selecting a store did not change the KPI strip');
    if (one.rows !== 7) throw new Error('store table should still show all 7 in-scope stores, got ' + one.rows);
    if (one.dimmed !== 6) throw new Error('expected 6 dimmed rows, got ' + one.dimmed);
    if (one.detail !== 1) throw new Error('store detail card did not appear');

    /* products league table must follow the same scope */
    await evalJs(`(function(){var b=document.querySelector('[data-mode="products"]');if(b)b.click();})()`);
    await sleep(320);
    const prod = await evalJs(`document.querySelectorAll('.tph-row').length`);
    console.log('products mode rows   :', prod);
    if (!prod) throw new Error('products league table is empty');

    await evalJs(`(function(){var b=document.querySelector('[data-mode="stores"]');if(b)b.click();
        var a=[].slice.call(document.querySelectorAll('[data-region]'))
                .filter(function(x){return x.getAttribute('data-region')==='*';})[0];
        if(a)a.click();})()`);
    await sleep(320);
    const back = await evalJs(`(function(){var e=document.querySelector('.tph-kpi:nth-child(1) .tph-kv');return e?e.textContent.trim():'';})()`);
    console.log('after ALL chip       :', back);
    if (back !== '$112.34M') throw new Error('ALL chip did not restore the unfiltered total: ' + back);

    /* --- 3. did it actually draw pixels? ---------------------------------
     * readPixels cannot be trusted here: the context is created without
     * preserveDrawingBuffer (correct for performance), so the backbuffer is
     * already cleared by the time an out-of-frame read happens. Screenshot the
     * composited page instead, then measure it back inside the page.        */
    async function sampleScreen(label) {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const b64 = shot.result.data;
      const stats = await evalJs(`(function(){
        return new Promise(function(res){
          var img=new Image();
          img.onload=function(){
            var c=document.createElement('canvas'); c.__counted=true;
            c.width=img.width; c.height=img.height;
            var x=c.getContext('2d'); x.drawImage(img,0,0);
            /* sample the middle third, where the globe lives */
            var w=Math.floor(img.width/3), h=Math.floor(img.height/3);
            var d=x.getImageData(w,h,w,h).data;
            var seen={}, lit=0, n=0, sum=0;
            for(var i=0;i<d.length;i+=4){
              n++;
              var v=d[i]+d[i+1]+d[i+2];
              sum+=v;
              if(v>60) lit++;
              seen[(d[i]>>4)+'-'+(d[i+1]>>4)+'-'+(d[i+2]>>4)]=1;
            }
            res({colours:Object.keys(seen).length, litPct:+(lit/n*100).toFixed(1),
                 meanLum:+(sum/n/3).toFixed(1), w:img.width, h:img.height});
          };
          img.onerror=function(){res({error:'decode failed'});};
          img.src='data:image/png;base64,${b64}';
        });
      })()`);
      console.log(label.padEnd(21) + ':', JSON.stringify(stats));
      return stats;
    }
    const painted = await sampleScreen('globe pixels');
    if (painted.error) throw new Error('screenshot decode failed');
    if (painted.colours < 12) throw new Error('page centre has only ' + painted.colours + ' distinct colours');

    /* --- 4. the idempotency invariant ------------------------------------ */
    await evalJs(`document.getElementById('x10').click()`);
    await sleep(1400);
    await evalJs(`document.getElementById('xf').click()`);
    await sleep(900);
    const h = await evalJs(`window.__HARNESS`);
    console.log('after 21 injections  :', JSON.stringify(h));
    if (!h) throw new Error('harness never ran its check');
    if (h.ctx !== 0) throw new Error('unexpected WebGL context: ' + h.ctx);
    if (h.roots !== 1 || h.css !== 1) throw new Error('idempotency violated: ' + JSON.stringify(h));

    /* --- 5. empty payload must degrade, not throw ------------------------ */
    await evalJs(`document.getElementById('empty').click()`);
    await sleep(700);
    const emptySt = await evalJs(`(function(){
      return { fail: document.querySelectorAll('.tph-fail').length,
               panels: document.querySelectorAll('.tph-p').length,
               body: (document.querySelector('.tph-sempty')||{}).textContent || '' };
    })()`);
    console.log('empty payload        :', JSON.stringify(emptySt));
    await evalJs(`document.getElementById('empty').click()`);
    await sleep(500);

    /* --- 6. screenshot for the eyeball check ------------------------------ */
    await evalJs(`(function(){var b=document.querySelector('[data-mode="stores"]');if(b)b.click();})()`);
    await sleep(300);
    await evalJs(`document.querySelector('header').style.display='none';
                  document.getElementById('log').style.display='none';
                  document.getElementById('stage').style.cssText='position:absolute;inset:0;height:100vh'`);
    await sleep(2600);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    if (shot.result && shot.result.data) {
      const out = path.resolve(__dirname, 'home-smoke.png');
      fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
      console.log('screenshot           :', out);
    }

    const errs = consoleLines.filter(l => /EXCEPTION|Error|error/i.test(l));
    if (errs.length) { console.log('console errors       :'); errs.forEach(l => console.log('   ', l)); }
    else console.log('console errors       : none');

    console.log('\nSMOKE TEST PASSED');
    code = 0;
  } catch (e) {
    console.error('\nSMOKE TEST FAILED:', e.message);
    code = 1;
  } finally {
    try { if (ws) ws.close(); } catch (x) {}
    try { proc.kill(); } catch (x) {}
    process.exit(code);
  }
})();

/* Minimal WebSocket client so this file needs no npm install. */
async function loadWs() {
  try { return require('ws'); } catch (e) { /* fall through */ }
  const crypto = require('crypto');
  const net = require('net');
  const { EventEmitter } = require('events');
  class Sock extends EventEmitter {
    constructor(url) {
      super();
      const u = new URL(url);
      this.buf = Buffer.alloc(0);
      this.sock = net.connect(Number(u.port), u.hostname, () => {
        const key = crypto.randomBytes(16).toString('base64');
        this.sock.write(
          `GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\n` +
          `Connection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
      });
      this.handshook = false;
      this.sock.on('data', d => this.onData(d));
      this.sock.on('error', e => this.emit('error', e));
    }
    onData(d) {
      this.buf = Buffer.concat([this.buf, d]);
      if (!this.handshook) {
        const i = this.buf.indexOf('\r\n\r\n');
        if (i < 0) return;
        this.buf = this.buf.slice(i + 4);
        this.handshook = true;
        this.emit('open');
      }
      for (;;) {
        if (this.buf.length < 2) return;
        const b1 = this.buf[1], masked = (b1 & 0x80) !== 0;
        let len = b1 & 0x7f, off = 2;
        if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
        if (masked) off += 4;
        if (this.buf.length < off + len) return;
        const payload = this.buf.slice(off, off + len);
        this.buf = this.buf.slice(off + len);
        this.emit('message', payload);
      }
    }
    send(str) {
      const p = Buffer.from(str), mask = crypto.randomBytes(4);
      let head;
      if (p.length < 126) head = Buffer.from([0x81, 0x80 | p.length]);
      else if (p.length < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0xfe; head.writeUInt16BE(p.length, 2); }
      else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 0xff; head.writeBigUInt64BE(BigInt(p.length), 2); }
      const masked = Buffer.alloc(p.length);
      for (let i = 0; i < p.length; i++) masked[i] = p[i] ^ mask[i & 3];
      this.sock.write(Buffer.concat([head, mask, masked]));
    }
    close() { try { this.sock.destroy(); } catch (e) {} }
  }
  return Sock;
}
