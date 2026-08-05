/* Kelvara body map: geometric acceptance tests.

   The figure had been through four hand-eyed passes and each one left a
   different shape in the wrong place, so the placement rules live here as
   assertions instead of in my head. Every rule states an anatomical fact, and
   a failure prints the offending user-space box so the fix is mechanical.   */
'use strict';
const { test, expect } = require('@playwright/test');
const path = require('path');
const G = require('./geometry');

const PAGE = 'file:///' + path
  .resolve(__dirname, 'preview-figure.html')
  .split(path.sep).join('/');

/* The 27 OIICS regions the report has to be able to select. */
const REGIONS = [
  'skull', 'face', 'eye', 'ear', 'nose', 'jaw', 'neck',
  'shoulder', 'upperarm', 'elbow', 'forearm', 'wrist', 'hand', 'fingers',
  'chest', 'abdomen', 'upperback', 'lowerback', 'pelvis', 'groin', 'buttock',
  'thigh', 'knee', 'lowerleg', 'ankle', 'foot', 'toes'
];

/* Which view each region must appear on. A region on neither view is a hole in
   the drill path; a region on a view it has no business being on is a bug. */
const PRESENCE = {
  skull: ['front', 'back'], face: ['front'], eye: ['front'], nose: ['front'],
  ear: ['front', 'back'], jaw: ['front'], neck: ['front', 'back'],
  shoulder: ['front', 'back'], upperarm: ['front', 'back'],
  elbow: ['front', 'back'], forearm: ['front', 'back'],
  wrist: ['front', 'back'], hand: ['front', 'back'], fingers: ['front', 'back'],
  chest: ['front'], abdomen: ['front'], pelvis: ['front'], groin: ['front'],
  upperback: ['back'], lowerback: ['back'], buttock: ['back'],
  thigh: ['front', 'back'], knee: ['front', 'back'],
  lowerleg: ['front', 'back'], ankle: ['front', 'back'],
  foot: ['front', 'back'], toes: ['front', 'back']
};

/* Regions that must sit inside a larger parent. 0.9 not 1.0 because a stroke
   or a rounded corner is allowed to graze the parent's edge. */
const INSIDE = [
  ['front.eye', 'front.skull', 0.9],
  ['front.nose', 'front.skull', 0.9],
  ['front.face', 'front.skull', 0.9],
  ['front.groin', 'front.pelvis', 0.9]
];
/* The jaw is deliberately NOT in INSIDE. The mandible hangs below the cranium,
   so containment is the wrong rule for it: it has to touch the skull and sit
   below it, which the adjacency and vertical-order tests already cover. */

/* Regions that must touch their neighbour. A limb extremity that floats is the
   defect that survived three passes, so the tolerance is tight. */
const ADJACENT = [
  ['front.fingers', 'front.hand', 3],
  ['back.fingers', 'back.hand', 3],
  ['front.toes', 'front.foot', 3],
  ['back.toes', 'back.foot', 3],
  ['front.ear', 'front.skull', 2],
  ['back.ear', 'back.skull', 2],
  ['front.jaw', 'front.skull', 0],
  ['front.hand', 'front.wrist', 2],
  ['back.hand', 'back.wrist', 2],
  ['front.foot', 'front.ankle', 2],
  ['back.foot', 'back.ankle', 2]
];

/* Stacked neighbours: they share a border, they must not sit on top of each
   other. Ratio is overlap area over the smaller box. */
const DISJOINT = [
  ['back.lowerback', 'back.buttock', 0.25],
  ['front.chest', 'front.abdomen', 0.25],
  ['front.abdomen', 'front.pelvis', 0.25],
  ['front.thigh', 'front.knee', 0.2],
  ['front.knee', 'front.lowerleg', 0.2],
  ['front.lowerleg', 'front.ankle', 0.2],
  ['back.upperback', 'back.lowerback', 0.25],
  ['front.forearm', 'front.wrist', 0.2],
  ['front.upperarm', 'front.elbow', 0.2]
];

/* Splitting the 720-wide canvas: front figure left, back figure right. */
const MIDLINE = 355;

let DATA;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto(PAGE);
  await page.waitForSelector('path[data-region]');
  DATA = await page.evaluate(G.COLLECT);
  await page.close();
});

test.describe('structure', () => {
  test('all 27 OIICS regions are present and selectable', () => {
    const found = new Set(DATA.shapes.map(s => s.region));
    const missing = REGIONS.filter(r => !found.has(r));
    const unexpected = [...found].filter(r => !REGIONS.includes(r));
    expect(missing, 'regions with no drawable shape').toEqual([]);
    expect(unexpected, 'shapes claiming a region not in the OIICS list').toEqual([]);
  });

  test('each region appears on exactly the views it belongs to', () => {
    const byKey = G.byKey(DATA.shapes);
    const wrong = [];
    for (const [region, views] of Object.entries(PRESENCE)) {
      for (const v of ['front', 'back']) {
        const has = byKey.has(`${v}.${region}`);
        const should = views.includes(v);
        if (has !== should) wrong.push(`${v}.${region}: ${has ? 'present but should not be' : 'missing'}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test('every shape carries a tooltip and a case count', () => {
    const bad = DATA.shapes
      .filter(s => !s.title || !/: \d+ cases$/.test(s.title))
      .map(s => `${s.key}: ${JSON.stringify(s.title)}`);
    expect(bad).toEqual([]);
  });

  test('every shape has non-zero area', () => {
    const flat = DATA.shapes.filter(s => G.area(s) < 4)
      .map(s => `${s.key} ${G.fmt(s)}`);
    expect(flat).toEqual([]);
  });
});

test.describe('view separation', () => {
  test('front shapes stay left of the midline, back shapes right', () => {
    const strays = DATA.shapes.filter(s =>
      (s.view === 'front' && s.x2 > MIDLINE) || (s.view === 'back' && s.x < MIDLINE)
    ).map(s => `${s.key} ${G.fmt(s)}`);
    expect(strays, `shapes crossing x=${MIDLINE}`).toEqual([]);
  });

  test('the two figures do not overlap', () => {
    const f = G.union(DATA.shapes.filter(s => s.view === 'front'));
    const b = G.union(DATA.shapes.filter(s => s.view === 'back'));
    expect(G.overlapArea(f, b), `front ${G.fmt(f)} vs back ${G.fmt(b)}`).toBe(0);
  });

  test('both figures are about the same height', () => {
    const f = G.union(DATA.shapes.filter(s => s.view === 'front'));
    const b = G.union(DATA.shapes.filter(s => s.view === 'back'));
    const hf = f.y2 - f.y, hb = b.y2 - b.y;
    expect(Math.abs(hf - hb) / Math.max(hf, hb),
      `front height ${hf.toFixed(0)} vs back ${hb.toFixed(0)}`).toBeLessThan(0.08);
  });

  test('nothing escapes the viewBox', () => {
    const [, , w, h] = DATA.viewBox.split(/\s+/).map(Number);
    const out = [...DATA.shapes, ...DATA.labels]
      .filter(s => s.x < -1 || s.y < -1 || s.x2 > w + 1 || s.y2 > h + 1)
      .map(s => `${s.key} ${G.fmt(s)}`);
    expect(out, `viewBox is 0 0 ${w} ${h}`).toEqual([]);
  });
});

test.describe('placement', () => {
  test('sub-regions sit inside their parent', () => {
    const byKey = G.byKey(DATA.shapes);
    const bad = [];
    for (const [child, parent, min] of INSIDE) {
      const c = byKey.get(child), p = byKey.get(parent);
      if (!c || !p) { bad.push(`${child} or ${parent} missing`); continue; }
      const got = G.containment(c, p);
      if (got < min) bad.push(`${child} ${G.fmt(c)} only ${(got * 100).toFixed(0)}% inside ${parent} ${G.fmt(p)}, need ${min * 100}%`);
    }
    expect(bad).toEqual([]);
  });

  test('extremities touch the limb they belong to', () => {
    const byKey = G.byKey(DATA.shapes);
    const bad = [];
    for (const [a, b, tol] of ADJACENT) {
      const x = byKey.get(a), y = byKey.get(b);
      if (!x || !y) { bad.push(`${a} or ${b} missing`); continue; }
      const d = G.gap(x, y);
      if (d > tol) bad.push(`${a} ${G.fmt(x)} floats ${d.toFixed(1)}px from ${b} ${G.fmt(y)}, tolerance ${tol}`);
    }
    expect(bad).toEqual([]);
  });

  test('extremities are proportioned to the limb they extend', () => {
    /* Adjacency alone is too weak. When the fingers were derived from a box
       spanning BOTH hands they came out one bar 216 units wide laid across the
       hips, and every adjacency and float test still passed because the bar
       happened to touch things. Width and centring pin it down. */
    const byKey = G.byKey(DATA.shapes);
    const EXTENDS = [
      ['front.fingers', 'front.hand'], ['back.fingers', 'back.hand'],
      ['front.toes', 'front.foot'], ['back.toes', 'back.foot']
    ];
    const bad = [];
    for (const [child, parent] of EXTENDS) {
      const c = byKey.get(child), p = byKey.get(parent);
      if (!c || !p) { bad.push(`${child} or ${parent} missing`); continue; }
      /* Test SHAPE by SHAPE. Comparing the two union boxes hides the bug: a bar
         spanning both hands has almost exactly the width of both hands. */
      for (const cs of c.parts) {
        const host = p.parts.find(ps => G.gap(cs, ps) <= 3);
        if (!host) {
          bad.push(`${child} shape ${G.fmt(cs)} touches no ${parent} shape`);
          continue;
        }
        const cw = cs.x2 - cs.x, pw = host.x2 - host.x;
        if (cw > pw * 0.9) bad.push(`${child} shape is ${cw.toFixed(0)} wide on a ${pw.toFixed(0)}-wide ${parent}`);
        const off = Math.abs((cs.x + cs.x2) / 2 - (host.x + host.x2) / 2);
        if (off > pw * 0.6) bad.push(`${child} shape sits ${off.toFixed(0)} off the ${parent} it touches`);
      }
    }
    expect(bad).toEqual([]);
  });

  test('every added region has the same shape count on both sides', () => {
    /* A paired added region must draw an even number of shapes; an odd count
       means the mirror step dropped one. */
    const bad = [];
    for (const [key, box] of G.byKey(DATA.shapes)) {
      if (box.origin !== 'added') continue;
      if (['fingers', 'toes', 'ear', 'eye'].includes(box.region) && box.parts.length % 2 !== 0) {
        bad.push(`${key} has ${box.parts.length} shapes, not mirrored`);
      }
    }
    expect(bad).toEqual([]);
  });

  test('stacked neighbours do not sit on top of each other', () => {
    /* Compare individual shapes, not the union box. The chest is drawn as a
       pectoral plate plus two flank strips that run down past the waist, so its
       union box swallows the abdomen while no actual chest shape touches it.
       Testing unions here reported a 96% overlap that does not exist. */
    const byKey = G.byKey(DATA.shapes);
    const bad = [];
    for (const [a, b, max] of DISJOINT) {
      const x = byKey.get(a), y = byKey.get(b);
      if (!x || !y) { bad.push(`${a} or ${b} missing`); continue; }
      for (const pa of x.parts) {
        for (const pb of y.parts) {
          const r = G.overlapArea(pa, pb) / Math.min(G.area(pa), G.area(pb));
          if (r > max) {
            bad.push(`${a} ${G.fmt(pa)} overlaps ${b} ${G.fmt(pb)} by ${(r * 100).toFixed(0)}%, max ${max * 100}%`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  test('no region floats away from the rest of its figure', () => {
    /* Every region must touch or nearly touch at least one other region on the
       same view. A blob sitting in white space fails here. */
    const byKey = G.byKey(DATA.shapes);
    const orphans = [];
    for (const [key, box] of byKey) {
      const near = [...byKey].filter(([k, o]) =>
        k !== key && o.view === box.view && G.gap(box, o) <= 6);
      if (near.length === 0) orphans.push(`${key} ${G.fmt(box)} has no neighbour within 6px`);
    }
    expect(orphans).toEqual([]);
  });

  test('paired limbs are mirrored about the figure centre', () => {
    /* Every limb region draws left and right. If the two sides are not
       symmetric the mirror transform is wrong. */
    const CX = { front: 170, back: 540 };
    const PAIRED = ['shoulder', 'upperarm', 'elbow', 'forearm', 'wrist', 'hand',
      'fingers', 'thigh', 'knee', 'lowerleg', 'ankle', 'foot', 'toes', 'ear'];
    const bad = [];
    for (const [key, box] of G.byKey(DATA.shapes)) {
      const region = box.region;
      if (!PAIRED.includes(region)) continue;
      const cx = CX[box.view];
      const skew = Math.abs((box.x + box.x2) / 2 - cx);
      if (skew > 6) bad.push(`${key} centre is ${skew.toFixed(1)}px off the ${box.view} axis ${G.fmt(box)}`);
      const parts = box.parts;
      if (parts.length < 2) bad.push(`${key} has ${parts.length} shape(s), a paired limb needs both sides`);
    }
    expect(bad).toEqual([]);
  });

  test('vertical order down the body is anatomically correct', () => {
    const byKey = G.byKey(DATA.shapes);
    const ORDER = {
      front: ['skull', 'jaw', 'neck', 'chest', 'abdomen', 'pelvis', 'thigh', 'knee', 'lowerleg', 'ankle', 'foot', 'toes'],
      back: ['skull', 'neck', 'upperback', 'lowerback', 'buttock', 'thigh', 'knee', 'lowerleg', 'ankle', 'foot', 'toes']
    };
    const ARM = {
      front: ['shoulder', 'upperarm', 'elbow', 'forearm', 'wrist', 'hand', 'fingers'],
      back: ['shoulder', 'upperarm', 'elbow', 'forearm', 'wrist', 'hand', 'fingers']
    };
    const bad = [];
    for (const [view, chains] of [['front', [ORDER.front, ARM.front]], ['back', [ORDER.back, ARM.back]]]) {
      for (const chain of chains) {
        for (let i = 0; i < chain.length - 1; i++) {
          const a = byKey.get(`${view}.${chain[i]}`), b = byKey.get(`${view}.${chain[i + 1]}`);
          if (!a || !b) continue;
          const ca = (a.y + a.y2) / 2, cb = (b.y + b.y2) / 2;
          if (ca >= cb) bad.push(`${view}: ${chain[i]} (cy ${ca.toFixed(0)}) is not above ${chain[i + 1]} (cy ${cb.toFixed(0)})`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

test.describe('labels', () => {
  test('every region has exactly one label per view it appears on', () => {
    const shapeKeys = new Set(DATA.shapes.map(s => s.key));
    const labelKeys = DATA.labels.map(l => l.key);
    const missing = [...shapeKeys].filter(k => !labelKeys.includes(k));
    const dupes = labelKeys.filter((k, i) => labelKeys.indexOf(k) !== i);
    expect(missing, 'shapes with no label').toEqual([]);
    expect(dupes, 'duplicated labels').toEqual([]);
  });

  test('labels do not collide with each other', () => {
    const bad = [];
    for (let i = 0; i < DATA.labels.length; i++) {
      for (let j = i + 1; j < DATA.labels.length; j++) {
        const a = DATA.labels[i], b = DATA.labels[j];
        const o = G.overlapArea(a, b);
        if (o > 0.15 * Math.min(G.area(a), G.area(b))) {
          bad.push(`"${a.text}" ${G.fmt(a)} collides with "${b.text}" ${G.fmt(b)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  test('label ink contrasts with the region under it', () => {
    /* Measure the real contrast between ink and fill rather than trusting the
       shade the bake keyed off. That proxy is what put white text on a
       mid-amber lower back. WCAG AA for small text is 4.5:1; 3.0 is the floor
       here because the labels also carry a 2.4px contrasting halo. */
    const rel = hex => {
      const n = parseInt(hex.slice(1), 16);
      const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    };
    const ratio = (a, b) => {
      const [x, y] = [rel(a), rel(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    const byKey = G.byKey(DATA.shapes);
    const bad = [];
    for (const l of DATA.labels) {
      const s = byKey.get(l.key);
      if (!s) continue;
      const r = ratio(l.fill, s.parts[0].fill);
      if (r < 3.0) {
        bad.push(`"${l.text}" ink ${l.fill} on fill ${s.parts[0].fill} is only ${r.toFixed(2)}:1`);
      }
    }
    expect(bad).toEqual([]);
  });

  test('no label covers a region other than its own', async ({ page }) => {
    /* The design's head label sat at the centre of the head. Once a face panel
       and two eyes were drawn there, "Skull" was printed straight over them and
       every other label test still passed.

       This samples what is actually painted under the label rather than
       comparing bounding boxes. The neck is a T shape whose box spans the whole
       upper back, and the chest is a plate plus two long flanks; against boxes
       every torso label looked like a collision. A label may sit on its own
       region, on that region's anatomical parent, or on nothing. */
    await page.goto(PAGE);
    await page.waitForSelector('text[data-label]');
    const bad = await page.evaluate(() => {
      const PARENT = {
        eye: 'skull', nose: 'skull', face: 'skull', ear: 'skull', jaw: 'skull',
        groin: 'pelvis', fingers: 'hand', toes: 'foot'
      };
      const svg = document.querySelector('svg');
      const out = [];
      for (const t of svg.querySelectorAll('text[data-label]')) {
        const [, region] = t.dataset.label.split('.');
        const ok = new Set([region, PARENT[region]].filter(Boolean));
        const b = t.getBoundingClientRect();
        const tally = {};
        let n = 0;
        for (let i = 1; i < 8; i++) {
          for (let j = 1; j < 4; j++) {
            const hit = document.elementFromPoint(
              b.left + (b.width * i) / 8, b.top + (b.height * j) / 4);
            const r = hit && hit.dataset ? hit.dataset.region : null;
            n++;
            if (r && !ok.has(r)) tally[r] = (tally[r] || 0) + 1;
          }
        }
        for (const [r, c] of Object.entries(tally)) {
          if (c / n > 0.30) out.push(`"${t.textContent}" sits on ${r} over ${((c / n) * 100).toFixed(0)}% of its area`);
        }
      }
      return out;
    });
    expect(bad).toEqual([]);
  });

  test('each label sits on or beside its own region', () => {
    const byKey = G.byKey(DATA.shapes);
    const bad = [];
    for (const l of DATA.labels) {
      const s = byKey.get(l.key);
      if (!s) continue;
      const d = G.gap(l, s);
      if (d > 40) bad.push(`"${l.text}" ${G.fmt(l)} is ${d.toFixed(0)}px from ${l.key} ${G.fmt(s)}`);
    }
    expect(bad).toEqual([]);
  });
});

test.describe('interaction', () => {
  test('every region has somewhere the user can actually click it', async ({ page }) => {
    /* Bbox-centre hit-testing was the wrong probe: the deltoid is a crescent
       whose bbox centre lies on the upper arm, and the skull's centre is
       legitimately covered by the face. What matters for a drill interaction is
       weaker and more useful - each region must expose at least one hittable
       pixel somewhere. A region with none is unreachable. */
    await page.goto(PAGE);
    await page.waitForSelector('path[data-region]');
    const result = await page.evaluate(() => {
      const svg = document.querySelector('svg');
      const byKey = new Map();
      for (const el of svg.querySelectorAll('path[data-region]')) {
        if (!byKey.has(el.dataset.key)) byKey.set(el.dataset.key, []);
        byKey.get(el.dataset.key).push(el);
      }
      const unreachable = [], thin = [];
      for (const [key, els] of byKey) {
        let hits = 0;
        for (const el of els) {
          const b = el.getBoundingClientRect();
          const N = 15;
          for (let i = 1; i < N; i++) {
            for (let j = 1; j < N; j++) {
              const x = b.left + (b.width * i) / N;
              const y = b.top + (b.height * j) / N;
              const hit = document.elementFromPoint(x, y);
              if (hit === el) hits++;
            }
          }
        }
        if (hits === 0) unreachable.push(key);
        else if (hits < 6) thin.push(`${key} exposes only ${hits} of ${els.length * 196} sample points`);
      }
      return { unreachable, thin };
    });
    expect(result.unreachable, 'regions with no clickable pixel at all').toEqual([]);
    expect(result.thin, 'regions too small to click reliably').toEqual([]);
  });

  test('hovering a region reports its name and count', async ({ page }) => {
    await page.goto(PAGE);
    await page.waitForSelector('path[data-region]');
    const el = page.locator('path[data-key="front.chest"]').first();
    await el.hover({ force: true });
    await expect(page.locator('#out')).toContainText(/Chest: \d+ cases/);
  });

  test('shading is monotonic with case count', async () => {
    /* The map is only honest if more cases is never a lighter fill. */
    const lum = h => {
      const n = parseInt(h.slice(1), 16);
      return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    };
    const rows = [...G.byKey(DATA.shapes).values()]
      .map(s => ({ region: s.region, cases: s.cases, l: lum(s.parts[0].fill) }))
      .sort((a, b) => a.cases - b.cases);
    const bad = [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].cases > rows[i - 1].cases && rows[i].l > rows[i - 1].l + 0.5) {
        bad.push(`${rows[i].region} (${rows[i].cases} cases) is lighter than ${rows[i - 1].region} (${rows[i - 1].cases})`);
      }
    }
    expect(bad).toEqual([]);
  });
});

test.describe('appearance', () => {
  test('figure matches the approved render', async ({ page }) => {
    await page.goto(PAGE);
    await page.waitForSelector('path[data-region]');
    /* Tight on purpose. At 2% a recolour of every label on the page still
       counted as a match, so the baseline silently went stale and I reviewed an
       old picture. Anything a human would notice has to fail here. */
    await expect(page.locator('svg')).toHaveScreenshot('body-map.png', {
      maxDiffPixelRatio: 0.001
    });
  });
});
