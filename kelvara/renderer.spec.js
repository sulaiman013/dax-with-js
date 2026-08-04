/* Kelvara body map: renderer acceptance tests.

   The fixture ships the same payload shape the DAX measure emits, and
   expected.json holds the same KPIs computed a second time straight off the
   raw CSV rows. These tests compare what the page prints against that
   independent calculation, so an aggregation mistake would have to be made
   twice, in two different shapes, to pass.                                  */
'use strict';
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const G = require('./geometry');

const PAGE = 'file:///' + path.resolve(__dirname, 'fixture.html').split(path.sep).join('/');
const EXP = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'expected.json'), 'utf8'));

/* The visual is FitToPage on a 1920x1080 canvas. Testing at any other size
   would prove nothing about whether the page fits. */
test.use({ viewport: { width: 1920, height: 1080 } });

const n = (s) => Number(String(s).replace(/[^0-9.\-]/g, ''));

async function open(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(PAGE);
  await page.waitForSelector('#kv-figure path[data-region]');
  return errors;
}

/* The renderer coalesces repaints into one animation frame, so a click has not
   reached the DOM by the time the next CDP call returns. Waiting two frames
   guarantees the pending paint has run. Without this the suite was flaky in a
   way that looked like a filtering bug: the same two clicks read 178/178 on one
   run and 1492/378 on the next, both times because the first read was early. */
async function settle(page) {
  await page.evaluate(() => new Promise(
    (r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/* Read the KPI strip into {label: {value, sub}}. */
async function kpis(page) {
  await settle(page);
  return page.evaluate(() => {
    const out = {};
    document.querySelectorAll('.kv-kpi').forEach((el) => {
      out[el.querySelector('.kv-kl').textContent.trim()] = {
        value: el.querySelector('strong').textContent.trim(),
        sub: el.querySelector('.kv-ks').textContent.trim()
      };
    });
    return out;
  });
}

test.describe('renderer boot', () => {
  test('renders with no script errors', async ({ page }) => {
    const errors = await open(page);
    const inPage = await page.evaluate(() => window.__kvErrors || []);
    expect(errors, 'uncaught errors').toEqual([]);
    expect(inPage, 'window error events').toEqual([]);
    await expect(page.locator('#kv-root')).toBeVisible();
  });

  test('every structural block is present', async ({ page }) => {
    await open(page);
    for (const sel of ['.kv-head h1', '.kv-bar', '.kv-kpis', '#kv-figure', '.kv-legend',
                       '.kv-side', '.kv-trend svg', '.kv-through', '.kv-reset']) {
      await expect(page.locator(sel).first(), sel).toBeVisible();
    }
    expect(await page.locator('.kv-kpi').count()).toBe(6);
    expect(await page.locator('.kv-side .kv-panel').count()).toBe(4);
    expect(await page.locator('.kv-fg').count(), 'filter groups').toBe(5);
  });

  test('the whole page fits 1920x1080 with nothing cut off', async ({ page }) => {
    await open(page);
    const fit = await page.evaluate(() => {
      const de = document.documentElement;
      const root = document.getElementById('kv-root');
      const over = [];
      /* Walk everything and record any element whose painted box escapes the
         viewport. FitToPage does not scroll: overflow here is content the user
         simply never sees. */
      document.querySelectorAll('#kv-root *').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (r.bottom > 1080.5 || r.right > 1920.5 || r.top < -0.5 || r.left < -0.5) {
          over.push(`${el.className || el.tagName} ${JSON.stringify({
            t: Math.round(r.top), l: Math.round(r.left),
            b: Math.round(r.bottom), r: Math.round(r.right)
          })}`);
        }
      });
      return {
        scrollH: de.scrollHeight, scrollW: de.scrollWidth,
        rootH: Math.round(root.getBoundingClientRect().height),
        over: over.slice(0, 10)
      };
    });
    expect(fit.over, 'elements outside the 1920x1080 canvas').toEqual([]);
    expect(fit.scrollH, 'vertical overflow').toBeLessThanOrEqual(1080);
    expect(fit.scrollW, 'horizontal overflow').toBeLessThanOrEqual(1920);
  });

  test('the figure keeps all 27 selectable regions', async ({ page }) => {
    await open(page);
    const regions = await page.evaluate(() =>
      [...new Set([...document.querySelectorAll('#kv-figure path[data-region]')]
        .map((p) => p.dataset.region))]);
    expect(regions.length).toBe(27);
  });
});

test.describe('numbers', () => {
  test('the KPI strip matches an independent calculation', async ({ page }) => {
    await open(page);
    const k = await kpis(page);
    const e = EXP.all;
    expect(n(k['Cases'].value), 'cases').toBe(e.cases);
    expect(n(k['Recordable'].value), 'recordable').toBe(e.recordable);
    expect(n(k['Days away'].value), 'days away').toBe(e.daysAway);
    expect(n(k['TRIR'].value), 'TRIR').toBeCloseTo(e.trir, 2);
    expect(n(k['DART rate'].value), 'DART rate').toBeCloseTo(e.dartRate, 2);
    expect(n(k['Severity rate'].value), 'severity rate').toBeCloseTo(e.severityRate, 1);
  });

  test('the body map totals reconcile with the payload', async ({ page }) => {
    await open(page);
    /* Every case must land on exactly one region, so the sum of the shaded
       counts has to equal the case total. A region silently dropped by the
       svgId mapping would show up here and nowhere else. */
    const sum = await page.evaluate(() => {
      const seen = {};
      document.querySelectorAll('#kv-figure path[data-region]').forEach((p) => {
        seen[p.dataset.region] = +p.dataset.cases;
      });
      const drawn = Object.values(seen).reduce((a, b) => a + b, 0);
      /* Three OIICS codes cannot be drawn on a figure. The renderer states
         them under the map instead of dropping them, so the reconciliation is
         shaded regions + the not-localised strip. */
      const off = [...document.querySelectorAll('.kv-uchip b')]
        .reduce((a, b) => a + Number(b.textContent.replace(/[^0-9]/g, '')), 0);
      return drawn + off;
    });
    expect(sum).toBe(EXP.all.cases);
  });

  test('the trend has one point per month of exposure', async ({ page }) => {
    await open(page);
    const dots = await page.locator('.kv-trend circle').count();
    expect(dots).toBe(EXP.months.length);
  });

  test('the legend caps at the busiest region', async ({ page }) => {
    await open(page);
    const txt = await page.locator('.kv-legend span').last().textContent();
    expect(n(txt)).toBe(EXP.topRegionCases);
  });

  test('severity bars sum to the case total', async ({ page }) => {
    await open(page);
    const vals = await page.$$eval('.kv-sev .kv-bv',
      (els) => els.map((e) => Number(e.firstChild.textContent.replace(/[^0-9]/g, ''))));
    expect(vals.reduce((a, b) => a + b, 0)).toBe(EXP.all.cases);
  });
});

test.describe('interaction', () => {
  test('clicking a region filters every panel to it', async ({ page }) => {
    await open(page);
    const before = await kpis(page);
    expect(n(before['Cases'].value)).toBe(EXP.all.cases);

    await page.evaluate((rk) => {
      const svg = Object.keys(window.KV_SVG_TO_KEY)
        .find((k) => window.KV_SVG_TO_KEY[k].includes(rk));
      document.querySelector('#kv-figure path[data-region="' + svg + '"]').dispatchEvent(
        new MouseEvent('click', { bubbles: true }));
    }, EXP.topRegion);
    await expect(page.locator('.kv-chip')).toBeVisible();

    const after = await kpis(page);
    expect(n(after['Cases'].value), 'cases for the selected region').toBe(EXP.region.cases);
    expect(n(after['Recordable'].value)).toBe(EXP.region.recordable);
    expect(n(after['Days away'].value)).toBe(EXP.region.daysAway);
  });

  test('selecting a region does not shrink the exposure denominator', async ({ page }) => {
    /* The subtle one. Hours are exposure, not injury. If a region selection
       filtered hours as well, every rate would divide by a smaller number and
       a region would look more dangerous purely for being selected. Checking
       the printed TRIR against recordable * 200000 / TOTAL hours pins it. */
    await open(page);
    await page.evaluate((rk) => {
      const svg = Object.keys(window.KV_SVG_TO_KEY)
        .find((k) => window.KV_SVG_TO_KEY[k].includes(rk));
      document.querySelector('#kv-figure path[data-region="' + svg + '"]').dispatchEvent(
        new MouseEvent('click', { bubbles: true }));
    }, EXP.topRegion);

    const k = await kpis(page);
    const expectedTrir = (EXP.region.recordable * 200000) / EXP.all.hours;
    expect(n(k['TRIR'].value)).toBeCloseTo(expectedTrir, 2);
    expect(expectedTrir).toBeLessThan(EXP.all.trir);
  });

  test('the map still shows every region while one is selected', async ({ page }) => {
    await open(page);
    await page.evaluate((rk) => {
      const svg = Object.keys(window.KV_SVG_TO_KEY)
        .find((k) => window.KV_SVG_TO_KEY[k].includes(rk));
      document.querySelector('#kv-figure path[data-region="' + svg + '"]').dispatchEvent(
        new MouseEvent('click', { bubbles: true }));
    }, EXP.topRegion);
    const sum = await page.evaluate(() => {
      const seen = {};
      document.querySelectorAll('#kv-figure path[data-region]').forEach((p) => {
        seen[p.dataset.region] = +p.dataset.cases;
      });
      const drawn = Object.values(seen).reduce((a, b) => a + b, 0);
      /* Three OIICS codes cannot be drawn on a figure. The renderer states
         them under the map instead of dropping them, so the reconciliation is
         shaded regions + the not-localised strip. */
      const off = [...document.querySelectorAll('.kv-uchip b')]
        .reduce((a, b) => a + Number(b.textContent.replace(/[^0-9]/g, '')), 0);
      return drawn + off;
    });
    expect(sum, 'the map must not blank the unselected regions').toBe(EXP.all.cases);
  });

  test('clicking the same region again clears the selection', async ({ page }) => {
    await open(page);
    const click = () => page.evaluate((rk) => {
      const svg = Object.keys(window.KV_SVG_TO_KEY)
        .find((k) => window.KV_SVG_TO_KEY[k].includes(rk));
      document.querySelector('#kv-figure path[data-region="' + svg + '"]').dispatchEvent(
        new MouseEvent('click', { bubbles: true }));
    }, EXP.topRegion);
    await click();
    await expect(page.locator('.kv-chip')).toBeVisible();
    await click();
    await expect(page.locator('.kv-chip')).toHaveCount(0);
    expect(n((await kpis(page))['Cases'].value)).toBe(EXP.all.cases);
  });

  test('the chip clears the selection', async ({ page }) => {
    await open(page);
    await page.evaluate((rk) => {
      const svg = Object.keys(window.KV_SVG_TO_KEY)
        .find((k) => window.KV_SVG_TO_KEY[k].includes(rk));
      document.querySelector('#kv-figure path[data-region="' + svg + '"]').dispatchEvent(
        new MouseEvent('click', { bubbles: true }));
    }, EXP.topRegion);
    await page.locator('.kv-chip').click();
    await expect(page.locator('.kv-chip')).toHaveCount(0);
    expect(n((await kpis(page))['Cases'].value)).toBe(EXP.all.cases);
  });

  test('a severity row filters and toggles', async ({ page }) => {
    await open(page);
    const row = page.locator('.kv-sev li[data-sev]').first();
    /* firstChild only: .kv-bv is "1273" followed by an <em>85%</em>, and
       reading the whole node concatenated the count with the percentage. */
    const shown = await row.locator('.kv-bv').evaluate(
      (el) => Number(el.firstChild.textContent.replace(/[^0-9]/g, '')));
    await row.click();
    await expect(page.locator('.kv-sev li.on')).toHaveCount(1);
    expect(n((await kpis(page))['Cases'].value)).toBe(shown);
    await page.locator('.kv-sev li.on').click();
    await expect(page.locator('.kv-sev li.on')).toHaveCount(0);
    expect(n((await kpis(page))['Cases'].value)).toBe(EXP.all.cases);
  });

  test('Escape clears every selection', async ({ page }) => {
    await open(page);
    await page.locator('.kv-sev li[data-sev]').first().click();
    await page.locator('#kv-root').press('Escape');
    await expect(page.locator('.kv-chip')).toHaveCount(0);
    expect(n((await kpis(page))['Cases'].value)).toBe(EXP.all.cases);
  });

  test('re-running the runtime does not double-wire the click handler', async ({ page }) => {
    /* The visual re-executes the whole script on every measure evaluation. If
       boot() attached a second listener each time, one click would toggle the
       selection twice and nothing would appear to happen. */
    await open(page);
    await page.evaluate(() => { window.__KV.boot(); window.__KV.boot(); });
    await page.evaluate((rk) => {
      const svg = Object.keys(window.KV_SVG_TO_KEY)
        .find((k) => window.KV_SVG_TO_KEY[k].includes(rk));
      document.querySelector('#kv-figure path[data-region="' + svg + '"]').dispatchEvent(
        new MouseEvent('click', { bubbles: true }));
    }, EXP.topRegion);
    await expect(page.locator('.kv-chip')).toHaveCount(1);
    expect(n((await kpis(page))['Cases'].value)).toBe(EXP.region.cases);
  });
});

test.describe('the JS filter bar', () => {
  test('a site chip filters the page and the exposure denominator with it', async ({ page }) => {
    await open(page);
    const site = EXP.sites[0];
    await page.locator(`.kv-f[data-fk="site"][data-fv="${site}"]`).click();
    await expect(page.locator(`.kv-f[data-fk="site"][data-fv="${site}"]`))
      .toHaveAttribute('aria-pressed', 'true');

    const k = await kpis(page);
    const cases = n(k['Cases'].value);
    expect(cases, 'one site must be fewer cases than all sites').toBeLessThan(EXP.all.cases);
    expect(cases).toBeGreaterThan(0);

    /* Unlike a body-region selection, a site selection MUST shrink hours too:
       site is a property of exposure. If it did not, one site's TRIR would be
       divided by the whole company's hours and read far too low. */
    const trir = n(k['TRIR'].value);
    const naive = (n(k['Recordable'].value) * 200000) / EXP.all.hours;
    expect(trir, 'hours must be filtered by site as well').toBeGreaterThan(naive * 1.5);
  });

  test('chips are additive within a group', async ({ page }) => {
    await open(page);
    const [a, b] = EXP.sites;
    await page.locator(`.kv-f[data-fk="site"][data-fv="${a}"]`).click();
    const one = n((await kpis(page))['Cases'].value);
    await page.locator(`.kv-f[data-fk="site"][data-fv="${b}"]`).click();
    await expect(page.locator('.kv-f[data-fk="site"].on')).toHaveCount(2);
    const two = n((await kpis(page))['Cases'].value);
    expect(two, 'two sites must be more than one').toBeGreaterThan(one);
    expect(two).toBeLessThan(EXP.all.cases);
  });

  test('clear all resets every group at once', async ({ page }) => {
    await open(page);
    await page.locator(`.kv-f[data-fk="site"][data-fv="${EXP.sites[0]}"]`).click();
    await page.locator('.kv-f[data-fk="shift"]').first().click();
    await page.locator('.kv-f[data-fk="year"]').first().click();
    await settle(page);
    expect(await page.locator('.kv-f.on').count()).toBe(3);
    await page.locator('.kv-reset').click();
    await settle(page);
    expect(await page.locator('.kv-f.on').count()).toBe(0);
    expect(n((await kpis(page))['Cases'].value)).toBe(EXP.all.cases);
  });

  test('a year chip narrows the trend to that year', async ({ page }) => {
    await open(page);
    const before = await page.locator('.kv-trend circle').count();
    await page.locator('.kv-f[data-fk="year"]').first().click();
    await settle(page);
    const after = await page.locator('.kv-trend circle').count();
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThanOrEqual(12);
  });

  test('a filter and a region selection compose', async ({ page }) => {
    await open(page);
    await page.locator(`.kv-f[data-fk="site"][data-fv="${EXP.sites[0]}"]`).click();
    const siteOnly = n((await kpis(page))['Cases'].value);
    await page.evaluate((rk) => {
      const svg = Object.keys(window.KV_SVG_TO_KEY)
        .find((k) => window.KV_SVG_TO_KEY[k].includes(rk));
      document.querySelector('#kv-figure path[data-region="' + svg + '"]').dispatchEvent(
        new MouseEvent('click', { bubbles: true }));
    }, EXP.topRegion);
    const both = n((await kpis(page))['Cases'].value);
    expect(both).toBeLessThan(siteOnly);
    expect(both).toBeGreaterThan(0);
  });
});

test.describe('panel cross-filtering', () => {
  const PANELS = [
    ['mech', 'Top mechanisms'],
    ['role', 'Most exposed roles'],
    ['site', 'Cases by site']
  ];

  for (const [key, title] of PANELS) {
    test(`${title}: a row filters the whole page`, async ({ page }) => {
      await open(page);
      const row = page.locator(`.kv-bars li[data-fk="${key}"]`).first();
      const own = await row.locator('.kv-bv').evaluate(
        (el) => Number(el.firstChild.textContent.replace(/[^0-9]/g, '')));

      await row.click();
      await expect(page.locator(`li[data-fk="${key}"].on`)).toHaveCount(1);

      const k = await kpis(page);
      expect(n(k['Cases'].value), 'cases must narrow to the clicked row').toBe(own);
      expect(own).toBeLessThan(EXP.all.cases);
    });

    test(`${title}: the clicked panel keeps showing every row`, async ({ page }) => {
      /* Native cross-highlighting leaves the source visual intact and marks the
         selection. If a panel filtered itself, one click would collapse it to a
         single row and there would be no way back except Clear all. */
      await open(page);
      const before = await page.locator(`.kv-bars li[data-fk="${key}"]`).count();
      await page.locator(`.kv-bars li[data-fk="${key}"]`).first().click();
      await settle(page);
      const after = await page.locator(`.kv-bars li[data-fk="${key}"]`).count();
      expect(after, 'the source panel must not collapse').toBe(before);
      await expect(page.locator(`li[data-fk="${key}"]`).first())
        .toHaveAttribute('aria-pressed', 'true');
    });

    test(`${title}: rows are additive and toggle off`, async ({ page }) => {
      await open(page);
      const rows = page.locator(`.kv-bars li[data-fk="${key}"]`);
      await rows.nth(0).click();
      const one = n((await kpis(page))['Cases'].value);
      await rows.nth(1).click();
      await expect(page.locator(`li[data-fk="${key}"].on`)).toHaveCount(2);
      const two = n((await kpis(page))['Cases'].value);
      expect(two).toBeGreaterThan(one);
      await rows.nth(1).click();
      await expect(page.locator(`li[data-fk="${key}"].on`)).toHaveCount(1);
      expect(n((await kpis(page))['Cases'].value)).toBe(one);
    });
  }

  test('panel percentages stay sane when that panel is the one selected', async ({ page }) => {
    /* A self-excluded panel holds rows outside the current filter, so its
       percentages must divide by its own universe. Dividing by the page's
       filtered case count made the clicked row read 100% and its neighbours
       97%, of a set they are not in. */
    await open(page);
    await page.locator('.kv-bars li[data-fk="role"]').first().click();
    await settle(page);
    const pcts = await page.$$eval('li[data-fk="role"] .kv-bv em',
      (els) => els.map((e) => Number(e.textContent.replace(/[^0-9]/g, ''))));
    expect(pcts.length).toBeGreaterThan(1);
    expect(Math.max(...pcts), 'no row may claim the entire filtered set').toBeLessThan(60);
    expect(pcts.reduce((a, b) => a + b, 0), 'shares must not exceed 100')
      .toBeLessThanOrEqual(101);
  });

  test('a site row and the site chip drive the same selection', async ({ page }) => {
    await open(page);
    await page.locator('.kv-bars li[data-fk="site"]').first().click();
    await settle(page);
    const viaRow = await page.evaluate(() => JSON.stringify(window.__KV.state.site));
    await page.locator('.kv-reset').click();
    await settle(page);
    const key = JSON.parse(viaRow);
    await page.locator(`.kv-f[data-fk="site"][data-fv="${Object.keys(key)[0]}"]`).click();
    await settle(page);
    const viaChip = await page.evaluate(() => JSON.stringify(window.__KV.state.site));
    expect(viaChip).toBe(viaRow);
  });

  test('rate cards admit when the denominator could not follow', async ({ page }) => {
    /* Exposure has no mechanism grain, so filtering to one mechanism narrows
       the numerator and cannot narrow the hours. The card has to say so rather
       than print a rate that quietly mixes the two. */
    await open(page);
    let k = await kpis(page);
    expect(k['TRIR'].sub).toBe('per 200,000 hours');

    await page.locator('.kv-bars li[data-fk="mech"]').first().click();
    k = await kpis(page);
    expect(k['TRIR'].sub).toBe('per 200,000 hours, all exposure');

    /* A site filter DOES have an exposure counterpart, so no caveat. */
    await page.locator('.kv-reset').click();
    await page.locator('.kv-bars li[data-fk="site"]').first().click();
    k = await kpis(page);
    expect(k['TRIR'].sub).toBe('per 200,000 hours');
  });

  test('clear all resets panel selections too', async ({ page }) => {
    await open(page);
    for (const key of ['mech', 'role', 'site']) {
      await page.locator(`.kv-bars li[data-fk="${key}"]`).first().click();
    }
    await settle(page);
    expect(await page.locator('.kv-bars li.on').count()).toBe(3);
    await page.locator('.kv-reset').click();
    await settle(page);
    expect(await page.locator('.kv-bars li.on').count()).toBe(0);
    expect(n((await kpis(page))['Cases'].value)).toBe(EXP.all.cases);
  });

  test('rows are reachable and activatable from the keyboard', async ({ page }) => {
    await open(page);
    const row = page.locator('.kv-bars li[data-fk="role"]').first();
    await expect(row).toHaveAttribute('tabindex', '0');
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('li[data-fk="role"].on')).toHaveCount(1);
  });

  test('a panel selection composes with a region selection', async ({ page }) => {
    await open(page);
    await page.locator('.kv-bars li[data-fk="role"]').first().click();
    const roleOnly = n((await kpis(page))['Cases'].value);
    await page.evaluate((rk) => {
      const svg = Object.keys(window.KV_SVG_TO_KEY)
        .find((k) => window.KV_SVG_TO_KEY[k].includes(rk));
      document.querySelector('#kv-figure path[data-region="' + svg + '"]').dispatchEvent(
        new MouseEvent('click', { bubbles: true }));
    }, EXP.topRegion);
    const both = n((await kpis(page))['Cases'].value);
    expect(both).toBeLessThan(roleOnly);
    expect(both).toBeGreaterThan(0);
  });
});

test.describe('the explanation pane', () => {
  const text = (page) => page.locator('.kv-ex').innerText();

  test('explains the unfiltered page on first paint', async ({ page }) => {
    await open(page);
    await expect(page.locator('.kv-explain')).toBeVisible();
    const t = await text(page);
    expect(t).toContain('The period in full');
    expect(t).toMatch(/1,492 cases/);
    expect(t).toMatch(/219 were recordable/);
  });

  test('every number it prints is one the page is showing', async ({ page }) => {
    /* The whole point of generating this from the aggregate rather than from a
       screenshot: the prose cannot disagree with the cards above it. */
    await open(page);
    const t = await text(page);
    const k = await kpis(page);
    expect(t).toContain(k['Cases'].value);
    expect(t).toContain(k['Recordable'].value);
    expect(t).toContain(k['Days away'].value);
  });

  test('rewrites itself when a body region is selected', async ({ page }) => {
    await open(page);
    const before = await text(page);
    await page.evaluate((rk) => {
      const svg = Object.keys(window.KV_SVG_TO_KEY)
        .find((k) => window.KV_SVG_TO_KEY[k].includes(rk));
      document.querySelector('#kv-figure path[data-region="' + svg + '"]').dispatchEvent(
        new MouseEvent('click', { bubbles: true }));
    }, EXP.topRegion);
    await settle(page);
    const after = await text(page);
    expect(after).not.toBe(before);
    expect(after).toContain('Fingers and thumb');
    expect(after).toContain(String(EXP.region.cases));
  });

  test('names every active selection, not just the last one', async ({ page }) => {
    await open(page);
    await page.locator('.kv-bars li[data-fk="role"]').first().click();
    await page.locator('.kv-bars li[data-fk="site"]').first().click();
    await settle(page);
    const t = await text(page);
    const role = await page.locator('li[data-fk="role"].on .kv-bl').innerText();
    const site = await page.locator('li[data-fk="site"].on .kv-bl').innerText();
    expect(t).toContain(role);
    expect(t).toContain(site);
  });

  test('states the caveat when the denominator could not follow', async ({ page }) => {
    await open(page);
    expect(await text(page)).not.toContain('cannot narrow the hours');
    await page.locator('.kv-bars li[data-fk="mech"]').first().click();
    await settle(page);
    expect(await text(page)).toContain('cannot narrow the hours');
  });

  test('says so plainly when a selection matches nothing', async ({ page }) => {
    await open(page);
    /* Contradictory filters: one site crossed with a business unit it is not in. */
    await page.evaluate(() => {
      const st = window.__KV.state;
      st.site = { 1: true };
      const bu = window.KV_SITE_BU[1];
      const other = window.KV_BU.find((b) => b !== bu);
      st.bu = {}; st.bu[other] = true;
      window.__KV.boot();
    });
    await settle(page);
    expect(await text(page)).toContain('No cases fall inside the current filters');
  });

  test('nothing in the pane is clipped, in any selection state', async ({ page }) => {
    /* overflow:hidden means content that does not fit is silently truncated
       rather than escaping the canvas, so the page-fits test cannot see it.
       The caveat sentence was losing its last line exactly this way. */
    await open(page);
    const states = [
      null,
      () => document.querySelector('#kv-figure path[data-region="skull"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true })),
      () => document.querySelector('li[data-fk="mech"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true })),
      () => document.querySelector('li[data-fk="role"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    ];
    const clipped = [];
    for (const step of states) {
      if (step) await page.evaluate(step);
      await settle(page);
      const over = await page.evaluate(() => {
        const el = document.querySelector('.kv-ex');
        return { h: el.scrollHeight, c: el.clientHeight,
                 first: el.querySelector('p') ? el.querySelector('p').textContent.slice(0, 40) : '' };
      });
      if (over.h > over.c + 1) clipped.push(`${over.first}… ${over.h} into ${over.c}`);
    }
    expect(clipped, 'explanation text cut off').toEqual([]);
  });

  test('the model button is hidden until a key is supplied', async ({ page }) => {
    /* An API key cannot live in the measure: anything in DAX is readable by
       anyone who can open the report. The layer stays inert without one. */
    await open(page);
    await expect(page.locator('.kv-ai')).toHaveCount(0);
    await expect(page.locator('.kv-explain .kv-h3n')).toBeVisible();
  });

  test('the model layer sends facts, never pixels, and never blocks the pane',
    async ({ page }) => {
      await open(page);
      let sent = null;
      await page.route('**/chat/completions', async (route) => {
        sent = JSON.parse(route.request().postData());
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            choices: [{ message: { content: 'Hands dominate; check glove policy.' } }]
          })
        });
      });
      await page.evaluate(() => {
        window.__kvAI = { key: 'test-key', model: 'test/model' };
        window.__KV.boot();
      });
      await page.locator('.kv-ai').click();
      await expect(page.locator('.kv-aitext')).toHaveText(/glove policy/);

      expect(sent, 'a request was made').toBeTruthy();
      const brief = JSON.parse(sent.messages[1].content);
      expect(brief.totals.cases, 'the brief carries the real total').toBe(EXP.all.cases);
      expect(brief.totals.recordable).toBe(EXP.all.recordable);
      /* No image payload anywhere: the model gets numbers it cannot misread. */
      expect(JSON.stringify(sent)).not.toMatch(/data:image|image_url|base64/);
      /* The deterministic narrative is still there underneath. */
      expect(await text(page)).toMatch(/1,492 cases/);
    });

  test('a model failure degrades to the deterministic summary', async ({ page }) => {
    await open(page);
    await page.route('**/chat/completions', (route) => route.fulfill({ status: 500, body: '{}' }));
    await page.evaluate(() => {
      window.__kvAI = { key: 'test-key' };
      window.__KV.boot();
    });
    await page.locator('.kv-ai').click();
    await expect(page.locator('.kv-aierr')).toContainText('could not be reached');
    expect(await text(page), 'the real summary survives').toMatch(/219 were recordable/);
  });
});

test.describe('rendered figure geometry', () => {
  test('the shipped figure still satisfies the placement rules', async ({ page }) => {
    /* The geometry suite runs against the design-time preview. This runs the
       same collector against what the measure actually ships, so a mistake in
       the bake-to-runtime handoff cannot slip through. */
    await open(page);
    const data = await page.evaluate(G.COLLECT);
    const byKey = G.byKey(data.shapes);

    const pairs = [['front.fingers', 'front.hand'], ['back.fingers', 'back.hand'],
                   ['front.toes', 'front.foot'], ['back.toes', 'back.foot'],
                   ['front.eye', 'front.skull'], ['front.groin', 'front.pelvis']];
    const bad = [];
    for (const [a, b] of pairs) {
      const x = byKey.get(a), y = byKey.get(b);
      if (!x || !y) { bad.push(`${a} or ${b} missing from the shipped figure`); continue; }
      if (G.gap(x, y) > 3) bad.push(`${a} ${G.fmt(x)} is detached from ${b} ${G.fmt(y)}`);
    }
    const front = data.shapes.filter((s) => s.view === 'front');
    const back = data.shapes.filter((s) => s.view === 'back');
    if (G.overlapArea(G.union(front), G.union(back)) !== 0) bad.push('the two figures overlap');
    expect(bad).toEqual([]);
  });

  test('every shape carries a tooltip', async ({ page }) => {
    await open(page);
    const missing = await page.$$eval('#kv-figure path[data-region]',
      (els) => els.filter((e) => !e.querySelector('title')).length);
    expect(missing).toBe(0);
  });
});

test.describe('appearance', () => {
  test('page matches the approved render', async ({ page }) => {
    await open(page);
    await expect(page).toHaveScreenshot('report-page.png', { maxDiffPixelRatio: 0.002 });
  });
});
