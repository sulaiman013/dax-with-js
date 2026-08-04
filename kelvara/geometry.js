/* Geometry helpers shared by the specs. Everything works in SVG user space so
   the numbers in a failure message match the numbers in body-baked.js. */
'use strict';

/* Read every interactive shape out of the page as a user-space box.
   getBBox() is pre-transform, so compose the element's CTM relative to the
   <svg> root. That is the exact bug that dropped the back figure on top of the
   front one, so the harness must not repeat it. */
const COLLECT = `(() => {
  const svg = document.querySelector('svg');
  const root = svg.getScreenCTM().inverse();
  const box = (el) => {
    const b = el.getBBox();
    const m = root.multiply(el.getScreenCTM());
    const pts = [[b.x, b.y], [b.x + b.width, b.y],
                 [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]
      .map(([x, y]) => {
        const p = svg.createSVGPoint(); p.x = x; p.y = y;
        return p.matrixTransform(m);
      });
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    return {
      x: +Math.min(...xs).toFixed(2), y: +Math.min(...ys).toFixed(2),
      x2: +Math.max(...xs).toFixed(2), y2: +Math.max(...ys).toFixed(2)
    };
  };
  const shapes = [...svg.querySelectorAll('path[data-region]')].map((el, i) => ({
    i,
    region: el.dataset.region,
    view: el.dataset.view,
    key: el.dataset.key,
    origin: el.dataset.origin,
    cases: +el.dataset.cases,
    fill: el.getAttribute('fill'),
    title: el.querySelector('title') ? el.querySelector('title').textContent : null,
    ...box(el)
  }));
  const labels = [...svg.querySelectorAll('text[data-label]')].map(el => ({
    key: el.dataset.label,
    text: el.textContent,
    fill: el.getAttribute('fill'),
    ...box(el)
  }));
  const detail = [...svg.querySelectorAll('path:not([data-region])')].map(box);
  return { viewBox: svg.getAttribute('viewBox'), shapes, labels, detail };
})()`;

/* Union of a list of boxes. */
function union(boxes) {
  return {
    x: Math.min(...boxes.map(b => b.x)),
    y: Math.min(...boxes.map(b => b.y)),
    x2: Math.max(...boxes.map(b => b.x2)),
    y2: Math.max(...boxes.map(b => b.y2))
  };
}

/* Overlapping area of two boxes, 0 when they only touch. */
function overlapArea(a, b) {
  const w = Math.min(a.x2, b.x2) - Math.max(a.x, b.x);
  const h = Math.min(a.y2, b.y2) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function area(b) {
  return Math.max(0, b.x2 - b.x) * Math.max(0, b.y2 - b.y);
}

/* Smallest edge-to-edge distance; 0 when the boxes touch or overlap. */
function gap(a, b) {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x2, b.x2));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y2, b.y2));
  return Math.hypot(dx, dy);
}

/* How much of `inner` lies inside `outer`, 0..1. */
function containment(inner, outer) {
  const a = area(inner);
  return a === 0 ? 0 : overlapArea(inner, outer) / a;
}

/* Group shapes into one box per "view.region". */
function byKey(shapes) {
  const m = new Map();
  for (const s of shapes) {
    if (!m.has(s.key)) m.set(s.key, []);
    m.get(s.key).push(s);
  }
  const out = new Map();
  for (const [k, v] of m) out.set(k, { ...union(v), parts: v, region: v[0].region, view: v[0].view, origin: v[0].origin, cases: v[0].cases });
  return out;
}

function fmt(b) {
  return `[${b.x.toFixed(0)},${b.y.toFixed(0)} -> ${b.x2.toFixed(0)},${b.y2.toFixed(0)}]`;
}

module.exports = { COLLECT, union, overlapArea, area, gap, containment, byKey, fmt };
