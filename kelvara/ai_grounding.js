/* Grounding check for the optional model layer.

   The deterministic narrative cannot be wrong: it is computed from the same
   aggregate the panels are drawn from. The model layer CAN be wrong, so this
   measures how often it is. It intercepts the brief that was actually sent,
   then checks every number and every multi-word proper noun in the reply
   against it. A site or a role the model invented shows up here.

   Not part of the Playwright suite: it needs a real key and a network.

     OPENROUTER_KEY=... node ai_grounding.js [model] [runsPerRegion]

   The key is read from the environment and is never written to disk.
*/
'use strict';
const { chromium } = require('@playwright/test');
const path = require('path');

const KEY = process.env.OPENROUTER_KEY;
const MODEL = process.argv[2] || 'google/gemini-3.5-flash-lite';
const REPEAT = Number(process.argv[3] || 1);
if (!KEY) { console.error('set OPENROUTER_KEY'); process.exit(1); }

const PAGE = 'file:///' + path.resolve(__dirname, 'fixture.html').split(path.sep).join('/');
const REGIONS = ['skull', 'lowerback', 'hand', 'knee', 'eye', 'shoulder', 'foot', 'abdomen'];

/* Single leading capitals are sentence grammar, not proper nouns. A site, role
   or mechanism name is a multi-word or hyphenated capitalised run. */
const PROPER = /\b[A-Z][a-zA-Z]+(?:[- ][A-Z][a-zA-Z]+)+/g;
const NUMBER = /\b\d[\d,.]*\b/g;

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => console.log('PAGE ERROR:', String(e)));
  await page.goto(PAGE);
  await page.waitForSelector('#kv-figure path[data-region]');

  let brief = null;
  await page.route('**/chat/completions', async (route) => {
    brief = JSON.parse(JSON.parse(route.request().postData()).messages[1].content);
    await route.continue();
  });

  let runs = 0, violations = 0, caught = 0, totalMs = 0, totalWords = 0;
  const offenders = [];

  for (let pass = 0; pass < REPEAT; pass++) {
    for (const region of REGIONS) {
      await page.evaluate(([r, k, m]) => {
        const st = window.__KV.state;
        st.region = null; st.sev = null;
        ['site', 'bu', 'shift', 'wclass', 'year', 'mech', 'role'].forEach((x) => { st[x] = {}; });
        document.querySelector('#kv-figure path[data-region="' + r + '"]')
          .dispatchEvent(new MouseEvent('click', { bubbles: true }));
        window.__kvAI = { key: k, model: m };
        window.__KV.aiText = ''; window.__KV.aiKey = ''; window.__KV.aiErr = '';
        window.__KV.boot();
      }, [region, KEY, MODEL]);
      await page.evaluate(() => new Promise(
        (r) => requestAnimationFrame(() => requestAnimationFrame(r))));

      const t0 = Date.now();
      await page.locator('.kv-ai').click();
      await page.waitForSelector('.kv-aitext, .kv-aierr', { timeout: 45000 });
      const ms = Date.now() - t0;

      const got = await page.evaluate(() => ({
        ai: document.querySelector('.kv-aitext') ? document.querySelector('.kv-aitext').textContent : '',
        err: document.querySelector('.kv-aierr') ? document.querySelector('.kv-aierr').textContent : ''
      }));

      runs++;
      totalMs += ms;
      if (got.err) {
        /* A discard is the guard working, not a failure: the reply was checked
           and withheld. Counted separately from a transport error. */
        if (got.err.indexOf('Discarded') === 0) {
          caught++;
          console.log('CAUGHT     ' + region.padEnd(11) + got.err.slice(0, 90));
        } else {
          violations++;
          offenders.push(region + ': ' + got.err);
          console.log('ERROR      ' + region.padEnd(11) + got.err);
        }
        continue;
      }

      const flat = JSON.stringify(brief).toLowerCase();
      const names = [...new Set(got.ai.match(PROPER) || [])];
      const nums = [...new Set((got.ai.match(NUMBER) || []).map((x) => x.replace(/,/g, '')))];
      const badNames = names.filter((v) => flat.indexOf(v.toLowerCase()) === -1);
      const badNums = nums.filter((v) =>
        flat.indexOf(v) === -1 && flat.indexOf(String(Number(v))) === -1);
      const bad = badNames.concat(badNums);

      totalWords += got.ai.split(/\s+/).length;
      if (bad.length) {
        violations++;
        offenders.push(region + ': ' + bad.join(', '));
      }
      console.log((bad.length ? 'UNGROUNDED ' : 'ok         ') + region.padEnd(11) +
        'brief=' + String(JSON.stringify(brief).length).padStart(5) +
        ' words=' + String(got.ai.split(/\s+/).length).padStart(3) +
        ' ' + String(ms).padStart(5) + 'ms' +
        ' cited=' + (names.length + nums.length) +
        (bad.length ? '  >>> ' + bad.join(', ') : ''));
    }
  }

  console.log('');
  console.log('model            ' + MODEL);
  console.log('runs             ' + runs);
  console.log('printed ungrounded ' + violations);
  console.log('caught by guard  ' + caught);
  console.log('mean latency     ' + Math.round(totalMs / runs) + 'ms');
  console.log('mean length      ' + Math.round(totalWords / Math.max(1, runs - violations)) + ' words');
  if (offenders.length) {
    console.log('');
    offenders.forEach((o) => console.log('  ' + o));
  }
  await browser.close();
})();
