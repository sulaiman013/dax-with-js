/*
 * Minimal CDP probe: open preview-home.html headless, evaluate one expression,
 * print the result. For diagnosing layout, not part of the test suite.
 *   node probe-home.js "<js expression>"
 */
'use strict';
const { spawn } = require('child_process');
const http = require('http'); const path = require('path'); const fs = require('fs'); const os = require('os');
const Sock = require('./ws-shim.js');

const BROWSER = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => fs.existsSync(p));
const PORT = 9336;
const PAGE = 'file:///' + path.resolve(__dirname, 'preview-home.html').replace(/\\/g, '/');
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'tph-probe-'));
const EXPR = process.argv[2] || '1';

const proc = spawn(BROWSER, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + PROFILE, '--window-size=1600,900', '--no-first-run',
  '--allow-file-access-from-files', '--disable-gpu-sandbox', PAGE], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = p => new Promise((res, rej) => {
  const r = http.get({ host: '127.0.0.1', port: PORT, path: p }, s => {
    let b = ''; s.on('data', d => b += d); s.on('end', () => res(JSON.parse(b)));
  }); r.on('error', rej);
});

(async () => {
  try {
    let t = null;
    for (let i = 0; i < 80 && !t; i++) {
      try { t = (await get('/json/list')).find(x => x.type === 'page' && x.webSocketDebuggerUrl); } catch (e) {}
      if (!t) await sleep(250);
    }
    const ws = new Sock(t.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
    let id = 0; const pend = new Map();
    ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
    const send = (method, params) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
    await send('Runtime.enable');
    await sleep(2800);
    const r = await send('Runtime.evaluate', { expression: EXPR, returnByValue: true, awaitPromise: true });
    const d = r.result || {};
    if (d.exceptionDetails) console.log('EXCEPTION:', JSON.stringify(d.exceptionDetails).slice(0, 500));
    else console.log(d.result && d.result.value !== undefined ? d.result.value : JSON.stringify(d.result));
    ws.close(); proc.kill();
  } catch (e) { console.error('PROBE FAILED:', e.message); try { proc.kill(); } catch (x) {} }
  process.exit(0);
})();
