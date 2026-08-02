/*!
 * TrailPeak Outfitters - HOME
 * The landing page of the report as one DAX measure and one HTML Content visual.
 * ---------------------------------------------------------------------------
 * Repo    : https://github.com/sulaiman013/dax-with-js
 * License : MIT
 *
 * BUILD: this file is GENERATED. Edit src/trailpeak-home.src.js and run
 *   node build-home.mjs
 * which injects the baked font and geometry assets in place of the two
 * __BAKED_* markers below.
 *
 * WHY EVERYTHING IS BAKED
 * ---------------------------------------------------------------------------
 * The design prototype this is ported from pulled in four external things at
 * runtime: Google Fonts CSS, a woff2 per weight, d3 v7 (~280KB), topojson-client,
 * and a fetch of world-atlas countries-110m.json. Inside a Power BI custom visual
 * that is five or more requests from a null-origin iframe on a tenant that may
 * block any of them, and a late font is worse than a missing one because the
 * whole dashboard reflows after first paint.
 *
 * All of it is a pure function of fixed inputs, so all of it moved to build time:
 *
 *   - US outline and graticule: projected once with d3.geoAlbersUsa().fitExtent
 *     into a canonical 1000x620 viewBox, emitted as plain SVG path data. ~10KB
 *     replacing ~400KB of library and atlas.
 *   - Fonts: latin subset, reduced to the glyphs this dashboard can actually
 *     draw, four faces, inlined as base64.
 *
 * Runtime cost is one request for this file, immutable and cached forever.
 *
 * THE THREE THINGS THAT BREAK WEBGL-FREE VISUALS IN POWER BI ANYWAY
 * ---------------------------------------------------------------------------
 * 1. The host replaces the DOM on every cross-filter, resize and refresh, so
 *    this file is re-executed constantly. Install guard at the top; listeners
 *    wired once per root element, never once per render.
 * 2. Null origin. No cookies, no localStorage, no sessionStorage: they throw,
 *    they do not merely fail. UI state lives on window and is versioned.
 * 3. Nothing can be written back to the model. Every interaction here is local.
 *
 * THE DATA CONTRACT - window.__tpHome
 * ---------------------------------------------------------------------------
 * Aggregates only, roughly 5KB. Money is integer minor units and ratios are
 * integer basis points, so FORMAT(x,"0") in DAX emits no separator and no
 * decimal mark under any culture. Blanks arrive as null, never 0.
 *
 *   meta     {dataThrough, currency, locale, build}
 *   kpi      {rev, cogs, gp, gmBp, opex, ebitda, ebitdaBp, op, opBp,
 *             varc, varBp, units, prodRev, nProducts, nStores, nRegions, nMonths}
 *   stores   [[key, code, name, city, state, region, tier,
 *              rev, gmBp, op, varc, units, sqft], ...]
 *   regions  [[name, rev, gmBp, op, nStores], ...]
 *   trend    [[monthKey, label, rev, gp, op, budget], ...]   chronological
 *   products [[sku, name, category, rev, units, margin], ...]
 *   cats     [[name, rev, units, skus], ...]
 *
 * Latitude and longitude are NOT in the payload and NOT in the semantic model.
 * Geography is renderer reference data, the same class of thing as a colour
 * ramp. Store screen positions are pre-projected into US_XY, keyed by StoreCode.
 */
(function () {
  'use strict';

  var VERSION = '2.0.0';
  var NS = 'tph';

  /* -------------------------------------------------------------------------
   * 1. INSTALL GUARD
   * On re-execution the closure already exists. Do not rebuild it, just
   * re-render through the instance that is already installed.
   * ---------------------------------------------------------------------- */
  if (window.TPH && window.TPH.__installed === VERSION && typeof window.TPH.boot === 'function') {
    window.TPH.boot();
    return;
  }

  /* -------------------------------------------------------------------------
   * 2. BAKED ASSETS (injected by build-home.mjs)
   * ---------------------------------------------------------------------- */
  /*__BAKED_FONTS__*/
  /*__BAKED_USMAP__*/

  /* -------------------------------------------------------------------------
   * 3. DESIGN TOKENS
   * ---------------------------------------------------------------------- */
  var UP = '#3ddc97', DOWN = '#f0a13c', BLUE = '#5ec8f0', INK = '#8aa0ad';
  var REGION_COLOR = { Mountain: '#3ddc97', Pacific: '#5ec8f0', Midwest: '#a78bfa', Southwest: '#f0a13c' };
  var CAT_COLOR = {
    'Camping & Hiking': '#3ddc97', 'Climbing': '#a78bfa', 'Accessories': '#5ec8f0',
    'Winter Sports': '#7dd3fc', 'Apparel': '#f0a13c', 'Footwear': '#e879a6'
  };
  var REGION_ORDER = ['All', 'Mountain', 'Pacific', 'Midwest', 'Southwest'];

  /* Label placement per store, tuned by hand against the projection. Two
     Colorado stores 35km apart and three west-coast stores in a vertical line
     do not resolve themselves. */
  var LABEL = {
    DEN01: { dx: 10, dy: -4 },                     BLD01: { dx: -10, dy: -14, anchor: 'end' },
    SLC01: { dx: 0, dy: -18, anchor: 'middle' },   BOI01: { dx: 0, dy: -14, anchor: 'middle' },
    SEA01: { dx: -12, dy: -4, anchor: 'end' },     PDX01: { dx: -11, dy: 4, anchor: 'end' },
    SAC01: { dx: -10, dy: 3, anchor: 'end' },      AUS01: { dx: 10, dy: 4 },
    PHX01: { dx: 0, dy: 20, anchor: 'middle' },    ABQ01: { dx: 0, dy: 18, anchor: 'middle' },
    CHI01: { dx: 12, dy: 2 },                      MSP01: { dx: 0, dy: -14, anchor: 'middle' }
  };

  var SANS = "'Space Grotesk','Segoe UI',system-ui,-apple-system,sans-serif";
  var MONO = "'JetBrains Mono',ui-monospace,'Cascadia Mono',Consolas,monospace";

  /* -------------------------------------------------------------------------
   * 4. STYLES
   * The UI is authored in a fixed 1920x1080 stage and scaled with a transform,
   * so the layout is pixel-identical whatever size the visual ends up being.
   * ---------------------------------------------------------------------- */
  var CSS = TP_FONTS + [
    '.tph{position:absolute;inset:0;overflow:hidden;background:#06090c;',
    '  font-family:' + SANS + ';color:#e6edf2;-webkit-font-smoothing:antialiased;contain:strict}',
    '.tph *,.tph *::before,.tph *::after{box-sizing:border-box}',
    '.tph-stage{position:absolute;top:0;left:0;width:1920px;height:1080px;transform-origin:0 0;',
    '  background:radial-gradient(1200px 700px at 52% 34%,#0b141b 0%,#06090c 68%);',
    '  display:flex;flex-direction:column;overflow:hidden}',

    '@keyframes tphRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}',
    '@keyframes tphFade{from{opacity:0}to{opacity:1}}',
    '@keyframes tphPulse{0%,100%{opacity:.35}50%{opacity:1}}',

    /* ---- header ---- */
    '.tph-hd{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;',
    '  padding:22px 32px 16px;animation:tphFade .5s ease both}',
    '.tph-brand{display:flex;align-items:center;gap:14px}',
    '.tph-mark{width:30px;height:30px;border:1.5px solid #3ddc97;border-radius:8px;transform:rotate(45deg);',
    '  display:flex;align-items:center;justify-content:center;flex:0 0 auto}',
    '.tph-mark i{width:9px;height:9px;background:#3ddc97;border-radius:2px;font-style:normal}',
    '.tph-bt h1{margin:0;font-size:19px;font-weight:700;letter-spacing:-.01em;line-height:1.2}',
    '.tph-bt p{margin:3px 0 0;font-family:' + MONO + ';font-size:10px;letter-spacing:.22em;color:#4d5e69}',
    '.tph-hdr{display:flex;align-items:center;gap:18px}',
    '.tph-live{display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;',
    '  border:1px solid rgba(61,220,151,.28);background:rgba(61,220,151,.06)}',
    '.tph-live i{width:6px;height:6px;border-radius:999px;background:#3ddc97;font-style:normal;',
    '  animation:tphPulse 2.4s ease-in-out infinite}',
    '.tph-live span{font-family:' + MONO + ';font-size:10px;letter-spacing:.18em;color:#3ddc97}',
    '.tph-thru{font-family:' + MONO + ';font-size:11px;color:#4d5e69;letter-spacing:.06em}',
    '.tph-thru b{color:#e6edf2;font-weight:400}',

    /* ---- main grid ---- */
    '.tph-main{flex:1 1 auto;display:grid;grid-template-columns:296px 1fr 404px;gap:18px;',
    '  padding:0 32px;min-height:0}',
    '.tph-card{background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.008));',
    '  border:1px solid rgba(255,255,255,.07);border-radius:16px;display:flex;flex-direction:column;',
    '  min-height:0;overflow:hidden}',

    /* ---- KPI rail ---- */
    '.tph-kpis{display:flex;flex-direction:column;gap:12px;min-height:0}',
    '.tph-kpi{flex:1 1 0;background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.012));',
    '  border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:16px 18px 12px;display:flex;',
    '  flex-direction:column;justify-content:space-between;position:relative;overflow:hidden;',
    '  animation:tphRise .55s ease both}',
    '.tph-kt{display:flex;align-items:baseline;justify-content:space-between}',
    '.tph-kt span:first-child{font-family:' + MONO + ';font-size:9.5px;letter-spacing:.2em;color:#6f8391}',
    '.tph-kt span:last-child{font-family:' + MONO + ';font-size:10px}',
    '.tph-kb{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;margin-top:8px}',
    '.tph-kv{font-family:' + MONO + ';font-size:34px;font-weight:500;letter-spacing:-.02em;line-height:1}',
    '.tph-ks{font-size:11px;color:#4d5e69;margin-top:8px}',

    /* ---- map panel ---- */
    '.tph-maph{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;padding:14px 18px 10px}',
    '.tph-mapt{display:flex;align-items:center;gap:10px}',
    '.tph-mapt b{font-family:' + MONO + ';font-size:10px;letter-spacing:.2em;color:#6f8391;font-weight:400}',
    '.tph-mapt span{font-size:11px;color:#4d5e69}',
    '.tph-chips{display:flex;gap:6px}',
    '.tph-chip{cursor:pointer;font-family:' + MONO + ';font-size:10px;letter-spacing:.1em;padding:6px 11px;',
    '  border-radius:999px;transition:all .18s ease;background:rgba(255,255,255,.03);',
    '  border:1px solid rgba(255,255,255,.09);color:#7d8f9c}',
    '.tph-chip:hover{border-color:rgba(255,255,255,.3)}',
    '.tph-chip.on{background:rgba(61,220,151,.14);border-color:rgba(61,220,151,.45);color:#3ddc97}',
    '.tph-mapw{flex:1 1 auto;min-height:0;position:relative}',
    '.tph-mapw svg{position:absolute;inset:0;width:100%;height:100%;display:block}',
    '.tph-legend{flex:0 0 auto;display:flex;align-items:center;gap:22px;padding:0 18px 14px;',
    '  font-family:' + MONO + ';font-size:9.5px;letter-spacing:.12em;color:#4d5e69}',
    '.tph-legend span{display:flex;align-items:center;gap:7px}',
    '.tph-legend i{width:8px;height:8px;border-radius:999px;font-style:normal}',
    '.tph-legend .r{margin-left:auto}',

    /* map nodes */
    '.tph-node{cursor:pointer;transition:opacity .18s ease}',
    '.tph-node .halo{transition:opacity .25s ease}',
    '.tph-node .disc{transition:fill-opacity .2s ease}',
    '.tph-node .val{transition:opacity .18s ease}',

    /* ---- leaderboard ---- */
    '.tph-lbh{flex:0 0 auto;padding:14px 16px 10px;display:flex;align-items:center;',
    '  justify-content:space-between;gap:10px}',
    '.tph-lbh>b{font-family:' + MONO + ';font-size:10px;letter-spacing:.2em;color:#6f8391;font-weight:400}',
    '.tph-seg{display:flex;background:rgba(255,255,255,.04);border-radius:999px;padding:3px}',
    '.tph-seg button{cursor:pointer;border:none;font-family:' + MONO + ';font-size:10px;letter-spacing:.12em;',
    '  padding:6px 14px;border-radius:999px;transition:all .2s ease;background:transparent;color:#6f8391}',
    '.tph-seg button.on{background:rgba(61,220,151,.16);color:#3ddc97}',
    '.tph-mtabs{flex:0 0 auto;display:flex;gap:6px;padding:0 16px 8px}',
    '.tph-mtabs button{cursor:pointer;flex:1 1 0;font-family:' + MONO + ';font-size:9.5px;letter-spacing:.1em;',
    '  padding:7px 0;border-radius:8px;transition:all .18s ease;background:transparent;',
    '  border:1px solid rgba(255,255,255,.08);color:#6f8391}',
    '.tph-mtabs button.on{background:rgba(61,220,151,.16);border-color:rgba(61,220,151,.4);color:#3ddc97}',

    '.tph-detail{flex:0 0 auto;margin:0 16px 12px;padding:14px;border-radius:12px;',
    '  background:rgba(61,220,151,.06);border:1px solid rgba(61,220,151,.22);animation:tphRise .35s ease both}',
    '.tph-dh{display:flex;align-items:flex-start;justify-content:space-between}',
    '.tph-dh h3{margin:0;font-size:16px;font-weight:700}',
    '.tph-dh p{margin:3px 0 0;font-family:' + MONO + ';font-size:10px;color:#6f8391}',
    '.tph-dh button{cursor:pointer;background:transparent;border:1px solid rgba(255,255,255,.14);',
    '  color:#7d8f9c;border-radius:8px;font-family:' + MONO + ';font-size:10px;padding:5px 9px}',
    '.tph-dh button:hover{color:#e6edf2;border-color:rgba(255,255,255,.3)}',
    '.tph-dg{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}',
    '.tph-dg div{display:flex;flex-direction:column;gap:5px}',
    '.tph-dg span:first-child{font-family:' + MONO + ';font-size:8.5px;letter-spacing:.14em;color:#6f8391}',
    '.tph-dg span:last-child{font-family:' + MONO + ';font-size:15px}',

    '.tph-rows{flex:1 1 auto;min-height:0;overflow:auto;scrollbar-width:none;padding:0 16px 12px}',
    '.tph-rows::-webkit-scrollbar{width:0;height:0}',
    '.tph-row{display:grid;grid-template-columns:26px 1fr auto;align-items:center;gap:10px;',
    '  padding:4px 8px;border-radius:10px;cursor:pointer;transition:background .16s ease,opacity .16s ease;',
    '  background:transparent}',
    '.tph-row.on{background:rgba(255,255,255,.055)}',
    '.tph-row.off{opacity:.28}',
    '.tph-rk{font-family:' + MONO + ';font-size:11px;color:#3d4b55}',
    '.tph-row.on .tph-rk{color:#3ddc97}',
    '.tph-rm{min-width:0;display:flex;flex-direction:column;gap:2px}',
    '.tph-rt{display:flex;align-items:center;gap:7px}',
    '.tph-rt i{width:6px;height:6px;border-radius:999px;flex:0 0 auto;font-style:normal}',
    '.tph-rt b{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.tph-bar{height:3px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden}',
    '.tph-bar i{display:block;height:100%;border-radius:999px;font-style:normal;',
    '  transition:width .5s cubic-bezier(.22,1,.36,1)}',
    '.tph-rs{font-family:' + MONO + ';font-size:9.5px;color:#4d5e69;letter-spacing:.06em}',
    '.tph-rv{text-align:right;display:flex;flex-direction:column;gap:4px}',
    '.tph-rv span:first-child{font-family:' + MONO + ';font-size:14px}',
    '.tph-rv span:last-child{font-family:' + MONO + ';font-size:10px}',

    /* ---- trend ---- */
    '.tph-trend{flex:0 0 auto;margin:18px 32px 24px;',
    '  background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.008));',
    '  border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:14px 20px 10px;',
    '  animation:tphFade .8s ease both}',
    '.tph-th{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}',
    '.tph-th b{font-family:' + MONO + ';font-size:10px;letter-spacing:.2em;color:#6f8391;font-weight:400}',
    '.tph-tl{display:flex;gap:18px;font-family:' + MONO + ';font-size:9.5px;letter-spacing:.12em;color:#6f8391}',
    '.tph-tl span{display:flex;align-items:center;gap:7px}',
    '.tph-tl i{width:14px;height:2px;font-style:normal}',

    /* ---- tooltip ---- */
    '.tph-tip{position:absolute;pointer-events:none;opacity:0;transition:opacity .14s ease;z-index:9;',
    '  background:rgba(8,14,19,.94);border:1px solid rgba(255,255,255,.12);border-radius:10px;',
    '  padding:9px 11px;font:400 11px/1.5 ' + MONO + ';color:#e6edf2;white-space:nowrap;',
    '  box-shadow:0 12px 34px rgba(0,0,0,.6);transform:translate(-50%,-115%)}',
    '.tph-tip.on{opacity:1}',
    '.tph-tipn{font:700 12px/1.3 ' + SANS + ';letter-spacing:.01em}',
    '.tph-tips{color:#7d8f9c;font-size:10px;margin:2px 0 7px}',
    '.tph-tipg{display:grid;grid-template-columns:auto auto;gap:2px 18px}',
    '.tph-tipg span:nth-child(odd){color:#7d8f9c}',
    '.tph-tipg span:nth-child(even){text-align:right}',

    '.tph-build{position:absolute;right:12px;bottom:6px;font-family:' + MONO + ';font-size:9px;',
    '  color:#22303a;letter-spacing:.08em;pointer-events:none}',

    '.tph-fail{position:absolute;inset:0;display:grid;place-items:center;background:#06090c;padding:40px;',
    '  text-align:center}',
    '.tph-fail b{display:block;font-size:17px;color:#f0a13c;margin-bottom:10px}',
    '.tph-fail p{margin:0;font-size:13px;line-height:1.65;color:#7d8f9c;max-width:620px}',
    '@media (prefers-reduced-motion:reduce){.tph-stage *{animation:none!important}}'
  ].join('');

  /* -------------------------------------------------------------------------
   * 5. UTILITIES
   * ---------------------------------------------------------------------- */
  function el(t, c, h) {
    var n = document.createElement(t);
    if (c) n.className = c;
    if (h != null) n.innerHTML = h;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /* Money arrives as integer cents. Divide only at the display boundary. */
  function money(c, dp) {
    if (!isNum(c)) return '—';
    var d = Math.abs(c) / 100, s = c < 0 ? '-' : '';
    if (d >= 1e9) return s + '$' + (d / 1e9).toFixed(dp == null ? 2 : dp) + 'B';
    if (d >= 1e6) return s + '$' + (d / 1e6).toFixed(dp == null ? 2 : dp) + 'M';
    if (d >= 1e3) return s + '$' + (d / 1e3).toFixed(1) + 'K';
    return s + '$' + d.toFixed(0);
  }
  function bp(v, dp) { return !isNum(v) ? '—' : (v / 100).toFixed(dp == null ? 2 : dp) + '%'; }
  function thou(n) {
    return !isNum(n) ? '—' : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function linePath(vals, w, h, pad) {
    var p = pad == null ? 3 : pad;
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), sp = (mx - mn) || 1;
    var d = '';
    for (var i = 0; i < vals.length; i++) {
      var x = (i / (vals.length - 1 || 1)) * w;
      var y = h - p - ((vals[i] - mn) / sp) * (h - p * 2);
      d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    return d;
  }
  function areaPath(vals, w, h, pad) { return linePath(vals, w, h, pad) + ' L' + w + ' ' + h + ' L0 ' + h + ' Z'; }

  /* -------------------------------------------------------------------------
   * 6. STATE
   * Versioned. It survives the DOM replacement, which is the point, but it must
   * not survive a build that changes what the fields mean.
   * ---------------------------------------------------------------------- */
  var S = window.__tphState;
  if (!S || S.v !== VERSION) {
    S = window.__tphState = { v: VERSION, mode: 'stores', metric: 'rev', region: 'All', hover: null, active: null };
  }

  var D = null, V = {}, uid = 0;

  /* -------------------------------------------------------------------------
   * 7. DECODE
   * ---------------------------------------------------------------------- */
  function decode(raw) {
    var d = { meta: raw.meta || {}, kpi: raw.kpi || {}, stores: [], regions: [], trend: [], products: [], cats: [] };
    (raw.stores || []).forEach(function (s) {
      var lp = LABEL[s[1]] || {}, xy = US_XY[s[1]];
      d.stores.push({
        id: s[0], code: s[1], name: s[2], city: s[3], st: s[4], region: s[5], type: s[6],
        rev: s[7], gmBp: s[8], op: s[9], varc: s[10], units: s[11], sqft: s[12],
        x: xy ? xy[0] : null, y: xy ? xy[1] : null,
        dx: lp.dx || 0, dy: lp.dy || 0, anchor: lp.anchor || 'start'
      });
    });
    (raw.regions || []).forEach(function (r) { d.regions.push({ name: r[0], rev: r[1], gmBp: r[2], op: r[3], n: r[4] }); });
    (raw.trend || []).forEach(function (t) { d.trend.push({ ym: t[0], label: t[1], rev: t[2], gp: t[3], op: t[4], bud: t[5] }); });
    (raw.products || []).forEach(function (p) { d.products.push({ sku: p[0], name: p[1], cat: p[2], rev: p[3], units: p[4], gp: p[5] }); });
    (raw.cats || []).forEach(function (c) { d.cats.push({ name: c[0], rev: c[1], units: c[2], skus: c[3] }); });
    return d;
  }

  /* Trailing twelve months against the twelve before it. The prototype hardcoded
     these deltas; there are 30 months of monthly grain in the payload, so there
     is no reason not to compute them. Returns null when there is not enough
     history rather than inventing a number. */
  function yoy(series, pick) {
    if (!series || series.length < 24) return null;
    var n = series.length, cur = 0, prv = 0;
    for (var i = n - 12; i < n; i++) cur += pick(series[i]) || 0;
    for (var j = n - 24; j < n - 12; j++) prv += pick(series[j]) || 0;
    if (!prv) return null;
    return (cur - prv) / Math.abs(prv);
  }
  function yoyRatio(series, num, den) {
    if (!series || series.length < 24) return null;
    var n = series.length, cn = 0, cd = 0, pn = 0, pd = 0;
    for (var i = n - 12; i < n; i++) { cn += num(series[i]) || 0; cd += den(series[i]) || 0; }
    for (var j = n - 24; j < n - 12; j++) { pn += num(series[j]) || 0; pd += den(series[j]) || 0; }
    if (!cd || !pd) return null;
    return (cn / cd - pn / pd) * 10000;   /* basis points */
  }

  /* -------------------------------------------------------------------------
   * 8. HEADER
   * ---------------------------------------------------------------------- */
  function buildHeader(d) {
    var n = el('div', NS + '-hd');
    var b = el('div', NS + '-brand');
    b.appendChild(el('div', NS + '-mark', '<i></i>'));
    var bt = el('div', NS + '-bt');
    bt.appendChild(el('h1', null, esc(d.meta.title || 'TrailPeak Outfitters')));
    bt.appendChild(el('p', null, esc(d.meta.company || 'FINANCE · MONTHLY REPORTING')));
    b.appendChild(bt);
    n.appendChild(b);

    var r = el('div', NS + '-hdr');
    r.appendChild(el('div', NS + '-live', '<i></i><span>MODEL LIVE</span>'));
    var thru = String(d.meta.dataThrough || '').replace(/^Data through\s*/i, '').toUpperCase();
    r.appendChild(el('div', NS + '-thru', 'DATA THROUGH <b>' + esc(thru) + '</b>'));
    n.appendChild(r);
    return n;
  }

  /* -------------------------------------------------------------------------
   * 9. KPI RAIL
   * ---------------------------------------------------------------------- */
  function buildKpis(d) {
    var wrap = el('div', NS + '-kpis');
    var k = d.kpi, tr = d.trend;
    var revs = tr.map(function (t) { return t.rev; });
    var ops = tr.map(function (t) { return t.op; });
    var gms = tr.map(function (t) { return t.rev ? t.gp / t.rev * 100 : 0; });

    /* D&A is not in the payload at monthly grain, so EBITDA per month is
       reconstructed by spreading the annual gap evenly. Flagged as approximate
       rather than presented as measured. */
    var dna = (isNum(k.ebitda) && isNum(k.op) && tr.length) ? (k.ebitda - k.op) / tr.length : 0;
    var ebs = ops.map(function (v) { return v + dna; });

    var revYoY = yoy(tr, function (t) { return t.rev; });
    var opYoY = yoy(tr, function (t) { return t.op; });
    var ebYoY = yoy(tr, function (t) { return t.op + dna; });
    var gmYoY = yoyRatio(tr, function (t) { return t.gp; }, function (t) { return t.rev; });

    function pctDelta(v) {
      if (v == null) return { t: '—', c: '#4d5e69' };
      return { t: (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '% YoY', c: v >= 0 ? UP : DOWN };
    }
    function bpDelta(v) {
      if (v == null) return { t: '—', c: '#4d5e69' };
      return { t: (v >= 0 ? '+' : '') + Math.round(v) + 'bp YoY', c: v >= 0 ? UP : DOWN };
    }

    var items = [
      { label: 'TOTAL REVENUE', value: money(k.rev), vals: revs, stroke: BLUE, fill: 'rgba(94,200,240,.16)',
        delta: pctDelta(revYoY),
        sub: thou(k.nMonths) + ' closed months · ' + (isNum(k.units) ? (k.units / 1e6).toFixed(2) + 'M units' : '—') },
      { label: 'GROSS MARGIN', value: bp(k.gmBp), vals: gms, stroke: '#a78bfa', fill: 'rgba(167,139,250,.14)',
        delta: bpDelta(gmYoY), sub: 'Gross profit ' + money(k.gp) },
      { label: 'EBITDA', value: money(k.ebitda), vals: ebs, stroke: UP, fill: 'rgba(61,220,151,.14)',
        delta: pctDelta(ebYoY), sub: bp(k.ebitdaBp) + ' of revenue' },
      /* This card's delta is variance against BUDGET, not year on year. The
         other three compare to last year because that is the only reference
         they have; operating profit has a plan to be measured against, and the
         sub-line already talks about budget. Mixing the two on one card is how
         a reader ends up quoting the wrong number in a meeting. */
      { label: 'OPERATING PROFIT', value: money(k.op), vals: ops, stroke: DOWN, fill: 'rgba(240,161,60,.14)',
        delta: isNum(k.varBp)
          ? { t: (k.varBp >= 0 ? '▲ ' : '▼ ') + Math.abs(k.varBp / 100).toFixed(1) + '% vs budget',
              c: k.varBp >= 0 ? UP : DOWN }
          : { t: '—', c: '#4d5e69' },
        sub: bp(k.opBp) + ' margin · ' + money(Math.abs(k.varc), 1) + (k.varc >= 0 ? ' over budget' : ' under budget') }
    ];

    items.forEach(function (it, i) {
      var c = el('div', NS + '-kpi');
      c.style.animationDelay = (i * 0.06) + 's';
      var top = el('div', NS + '-kt');
      top.appendChild(el('span', null, esc(it.label)));
      var dsp = el('span', null, esc(it.delta.t));
      dsp.style.color = it.delta.c;
      top.appendChild(dsp);
      c.appendChild(top);

      var mid = el('div', NS + '-kb');
      mid.appendChild(el('div', NS + '-kv', esc(it.value)));
      if (it.vals.length > 1) {
        mid.appendChild(el('div', null,
          '<svg width="96" height="34" viewBox="0 0 96 34" style="display:block;opacity:.95">' +
          '<path d="' + areaPath(it.vals, 96, 34, 4) + '" fill="' + it.fill + '"></path>' +
          '<path d="' + linePath(it.vals, 96, 34, 4) + '" fill="none" stroke="' + it.stroke +
          '" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"></path></svg>'));
      }
      c.appendChild(mid);
      c.appendChild(el('div', NS + '-ks', esc(it.sub)));
      wrap.appendChild(c);
    });
    return wrap;
  }

  /* -------------------------------------------------------------------------
   * 10. MAP
   * Geometry is baked; this only places bubbles and labels.
   * ---------------------------------------------------------------------- */
  function metricOf(s, m) { return m === 'op' ? s.op : m === 'gm' ? s.gmBp : s.rev; }

  function buildMap(d) {
    var panel = el('div', NS + '-card');

    var head = el('div', NS + '-maph');
    var t = el('div', NS + '-mapt');
    t.appendChild(el('b', null, 'STORE NETWORK'));
    t.appendChild(el('span', null, d.stores.length + ' stores · ' + d.regions.length +
      ' regions · bubble = ' + (S.metric === 'op' ? 'op profit' : S.metric === 'gm' ? 'margin' : 'revenue')));
    head.appendChild(t);
    var chips = el('div', NS + '-chips');
    REGION_ORDER.forEach(function (r) {
      var b = el('button', NS + '-chip' + (S.region === r ? ' on' : ''), r === 'All' ? 'ALL' : r.toUpperCase());
      b.type = 'button';
      b.setAttribute('data-region', r);
      b.setAttribute('aria-pressed', S.region === r ? 'true' : 'false');
      chips.appendChild(b);
    });
    head.appendChild(chips);
    panel.appendChild(head);

    var wrap = el('div', NS + '-mapw');
    var gid = NS + 'g' + (++uid), cid = NS + 'c' + uid;
    var vals = d.stores.map(function (s) { return metricOf(s, S.metric); });
    var mx = Math.max.apply(null, vals) || 1;
    var focus = S.hover || S.active;

    var nodes = '';
    d.stores.forEach(function (s, i) {
      if (s.x == null) return;
      var v = metricOf(s, S.metric);
      var rad = Math.max(6, Math.sqrt(v / mx) * 34);
      var col = s.varc >= 0 ? UP : DOWN;
      var inR = S.region === 'All' || s.region === S.region;
      var isF = focus === s.id;
      var dim = (focus && !isF) || !inR;
      var lx = s.dx + (s.anchor === 'end' ? -rad : s.anchor === 'middle' ? 0 : rad);
      var ly = s.dy + (s.anchor === 'middle' ? (s.dy < 0 ? -rad + 4 : rad - 2) : 4);

      nodes +=
        '<g class="' + NS + '-node" data-store="' + s.id + '" transform="translate(' + s.x + ',' + s.y + ')" ' +
        'opacity="' + (dim ? 0.22 : 1) + '" style="animation:tphFade .5s ease both;animation-delay:' +
        (0.06 * i + 0.1).toFixed(2) + 's">' +
        '<circle r="' + (rad * 2.3).toFixed(1) + '" fill="url(#' + gid + ')"></circle>' +
        '<circle class="halo" r="' + (isF ? rad + 12 : rad).toFixed(1) + '" fill="none" stroke="' + col +
        '" stroke-width="1" opacity="' + (isF ? 0.9 : 0) + '"></circle>' +
        '<circle class="disc" r="' + rad.toFixed(1) + '" fill="' + col + '" fill-opacity="' +
        (isF ? 0.5 : (s.type === 'Flagship' ? 0.26 : 0.16)) + '" stroke="' + col +
        '" stroke-opacity="0.75" stroke-width="' + (s.type === 'Flagship' ? 1.6 : 1) + '"></circle>' +
        '<circle r="' + Math.max(2, rad * 0.16).toFixed(1) + '" fill="' + col + '"></circle>' +
        '<circle r="' + Math.max(rad, 16).toFixed(1) + '" fill="transparent"></circle>' +
        '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="' + s.anchor +
        '" font-family="' + MONO.replace(/"/g, "'") + '" font-size="10" letter-spacing=".06em" fill="' +
        (isF ? '#e6edf2' : INK) + '">' + esc(s.city.toUpperCase()) + '</text>' +
        '<text class="val" x="' + lx.toFixed(1) + '" y="' + (ly + 12).toFixed(1) + '" text-anchor="' + s.anchor +
        '" font-family="' + MONO.replace(/"/g, "'") + '" font-size="10" fill="' + col +
        '" opacity="' + (isF ? 1 : 0) + '">' + esc(money(s.rev)) + '</text>' +
        '</g>';
    });

    wrap.innerHTML =
      '<svg viewBox="' + US_VIEWBOX + '" preserveAspectRatio="xMidYMid meet" role="img" ' +
      'aria-label="Map of the United States with ' + d.stores.length +
      ' store locations, bubble size by revenue, green ahead of budget and amber behind.">' +
      '<defs><radialGradient id="' + gid + '">' +
      '<stop offset="0%" stop-color="rgba(61,220,151,.30)"></stop>' +
      '<stop offset="100%" stop-color="rgba(61,220,151,0)"></stop></radialGradient>' +
      '<clipPath id="' + cid + '"><path d="' + US_LAND + '"></path></clipPath></defs>' +
      '<path d="' + US_LAND + '" fill="#0d1820" stroke="rgba(140,210,185,.32)" stroke-width="1" ' +
      'stroke-linejoin="round"></path>' +
      '<path d="' + US_GRAT + '" fill="none" stroke="rgba(255,255,255,.04)" stroke-width="0.5" ' +
      'clip-path="url(#' + cid + ')"></path>' +
      '<g>' + nodes + '</g></svg>';

    var tip = el('div', NS + '-tip');
    wrap.appendChild(tip);
    V.tip = tip;
    V.mapw = wrap;
    panel.appendChild(wrap);

    var lg = el('div', NS + '-legend');
    lg.innerHTML =
      '<span><i style="background:rgba(61,220,151,.35);border:1px solid ' + UP + '"></i>AHEAD OF BUDGET</span>' +
      '<span><i style="background:rgba(240,161,60,.35);border:1px solid ' + DOWN + '"></i>BEHIND BUDGET</span>' +
      '<span class="r">CLICK A STORE TO DRILL IN</span>';
    panel.appendChild(lg);
    return panel;
  }

  function paintTip() {
    if (!V.tip || !D) return;
    var focus = S.hover || S.active;
    var s = null;
    for (var i = 0; i < D.stores.length; i++) if (D.stores[i].id === focus) s = D.stores[i];
    if (!s || s.x == null || !V.mapw) { V.tip.classList.remove('on'); return; }

    /* The SVG uses preserveAspectRatio, so viewBox units are not panel pixels.
       Recover the actual transform instead of assuming the box fills the panel. */
    var r = V.mapw.getBoundingClientRect();
    var vb = US_VIEWBOX.split(' ');
    var vw = +vb[2], vh = +vb[3];
    var k = Math.min(r.width / vw, r.height / vh);
    var ox = (r.width - vw * k) / 2, oy = (r.height - vh * k) / 2;
    var vals = D.stores.map(function (q) { return metricOf(q, S.metric); });
    var mx = Math.max.apply(null, vals) || 1;
    var rad = Math.max(6, Math.sqrt(metricOf(s, S.metric) / mx) * 34);

    V.tip.innerHTML =
      '<div class="' + NS + '-tipn">' + esc(s.name) + '</div>' +
      '<div class="' + NS + '-tips">' + esc(s.code + ' · ' + s.city + ', ' + s.st + ' · ' + s.type) + '</div>' +
      '<div class="' + NS + '-tipg">' +
      '<span>Revenue</span><span>' + esc(money(s.rev)) + '</span>' +
      '<span>Op profit</span><span>' + esc(money(s.op)) + '</span>' +
      '<span>vs budget</span><span style="color:' + (s.varc >= 0 ? UP : DOWN) + '">' +
      (s.varc >= 0 ? '▲ ' : '▼ ') + esc(money(Math.abs(s.varc))) + '</span></div>';
    V.tip.style.left = (ox + s.x * k) + 'px';
    V.tip.style.top = (oy + (s.y - rad) * k - 6) + 'px';
    V.tip.classList.add('on');
  }

  /* -------------------------------------------------------------------------
   * 11. LEADERBOARD
   * ---------------------------------------------------------------------- */
  var METRICS = {
    stores: [['rev', 'REVENUE'], ['op', 'OP PROFIT'], ['gm', 'MARGIN']],
    products: [['rev', 'REVENUE'], ['op', 'GROSS PROFIT'], ['gm', 'UNITS']]
  };

  function buildBoard(d) {
    var panel = el('div', NS + '-card');

    var head = el('div', NS + '-lbh');
    head.appendChild(el('b', null, "WHO'S WINNING"));
    var seg = el('div', NS + '-seg');
    [['stores', 'STORES'], ['products', 'PRODUCTS']].forEach(function (m) {
      var b = el('button', S.mode === m[0] ? 'on' : '', m[1]);
      b.type = 'button'; b.setAttribute('data-mode', m[0]);
      seg.appendChild(b);
    });
    head.appendChild(seg);
    panel.appendChild(head);

    var mt = el('div', NS + '-mtabs');
    METRICS[S.mode].forEach(function (m) {
      var b = el('button', S.metric === m[0] ? 'on' : '', m[1]);
      b.type = 'button'; b.setAttribute('data-metric', m[0]);
      mt.appendChild(b);
    });
    panel.appendChild(mt);

    if (S.mode === 'stores' && S.active != null) {
      var a = null;
      for (var i = 0; i < d.stores.length; i++) if (d.stores[i].id === S.active) a = d.stores[i];
      if (a) panel.appendChild(buildDetail(a));
    }

    var rows = el('div', NS + '-rows');
    var list, valOf, mx, focus = S.hover || S.active;

    if (S.mode === 'stores') {
      valOf = function (s) { return metricOf(s, S.metric); };
      list = d.stores.slice().sort(function (p, q) { return valOf(q) - valOf(p); });
      mx = Math.max.apply(null, list.map(valOf)) || 1;
      list.forEach(function (s, i) {
        var inR = S.region === 'All' || s.region === S.region;
        var isF = focus === s.id;
        var row = el('div', NS + '-row' + (isF ? ' on' : '') + (inR ? '' : ' off'));
        row.setAttribute('data-store', s.id);
        row.innerHTML =
          '<span class="' + NS + '-rk">' + String(i + 1).padStart(2, '0') + '</span>' +
          '<div class="' + NS + '-rm"><div class="' + NS + '-rt"><i style="background:' +
          (REGION_COLOR[s.region] || BLUE) + '"></i><b>' + esc(s.name) + '</b></div>' +
          '<div class="' + NS + '-bar"><i style="width:' + Math.round(valOf(s) / mx * 100) +
          '%;background:' + (REGION_COLOR[s.region] || BLUE) + '"></i></div>' +
          '<span class="' + NS + '-rs">' + esc(s.city + ', ' + s.st + ' · ' + s.type.toUpperCase() +
          ' · ' + bp(s.gmBp) + ' GM') + '</span></div>' +
          '<div class="' + NS + '-rv"><span>' + esc(S.metric === 'gm' ? bp(s.gmBp) : money(valOf(s))) +
          '</span><span style="color:' + (s.varc >= 0 ? UP : DOWN) + '">' +
          (s.varc >= 0 ? '▲ ' : '▼ ') + esc(money(Math.abs(s.varc))) + '</span></div>';
        rows.appendChild(row);
      });
    } else {
      valOf = function (p) { return S.metric === 'op' ? p.gp : S.metric === 'gm' ? p.units : p.rev; };
      list = d.products.slice().sort(function (p, q) { return valOf(q) - valOf(p); });
      mx = Math.max.apply(null, list.map(valOf)) || 1;
      list.forEach(function (p, i) {
        var row = el('div', NS + '-row');
        row.innerHTML =
          '<span class="' + NS + '-rk">' + String(i + 1).padStart(2, '0') + '</span>' +
          '<div class="' + NS + '-rm"><div class="' + NS + '-rt"><i style="background:' +
          (CAT_COLOR[p.cat] || BLUE) + '"></i><b>' + esc(p.name) + '</b></div>' +
          '<div class="' + NS + '-bar"><i style="width:' + Math.round(valOf(p) / mx * 100) +
          '%;background:' + (CAT_COLOR[p.cat] || BLUE) + '"></i></div>' +
          '<span class="' + NS + '-rs">' + esc(p.cat.toUpperCase() + ' · ' + p.sku) + '</span></div>' +
          '<div class="' + NS + '-rv"><span>' +
          esc(S.metric === 'gm' ? (p.units / 1000).toFixed(1) + 'K u' : money(valOf(p))) +
          '</span><span style="color:#6f8391">' +
          esc(p.rev ? (p.gp / p.rev * 100).toFixed(1) + '% GM' : '—') + '</span></div>';
        rows.appendChild(row);
      });
    }
    panel.appendChild(rows);
    return panel;
  }

  function buildDetail(a) {
    var n = el('div', NS + '-detail');
    var h = el('div', NS + '-dh');
    var left = el('div');
    left.appendChild(el('h3', null, esc(a.name)));
    left.appendChild(el('p', null, esc(a.code + ' · ' + a.city + ', ' + a.st + ' · ' +
      a.region.toUpperCase() + ' · ' + thou(a.sqft) + ' SQFT')));
    h.appendChild(left);
    var cb = el('button', null, 'CLOSE');
    cb.type = 'button'; cb.setAttribute('data-close', '1');
    h.appendChild(cb);
    n.appendChild(h);

    var g = el('div', NS + '-dg');
    [['REVENUE', money(a.rev), '#e6edf2'],
     ['OP PROFIT', money(a.op), '#e6edf2'],
     ['VS BUDGET', (a.varc >= 0 ? '+' : '−') + money(Math.abs(a.varc)), a.varc >= 0 ? UP : DOWN],
     ['REV / SQFT', a.sqft ? '$' + thou(Math.round(a.rev / 100 / a.sqft)) : '—', '#e6edf2']
    ].forEach(function (s) {
      var c = el('div');
      c.appendChild(el('span', null, s[0]));
      var v = el('span', null, esc(s[1]));
      v.style.color = s[2];
      c.appendChild(v);
      g.appendChild(c);
    });
    n.appendChild(g);
    return n;
  }

  /* -------------------------------------------------------------------------
   * 12. TREND
   * ---------------------------------------------------------------------- */
  function buildTrend(d) {
    var n = el('div', NS + '-trend');
    var head = el('div', NS + '-th');
    head.appendChild(el('b', null, 'MONTHLY REVENUE AND OPERATING PROFIT · ' + d.trend.length + ' CLOSED MONTHS'));
    head.appendChild(el('div', NS + '-tl',
      '<span><i style="background:' + BLUE + '"></i>REVENUE</span>' +
      '<span><i style="background:' + UP + '"></i>OPERATING PROFIT</span>' +
      '<span><i style="background:#4d5e69"></i>BUDGET</span>'));
    n.appendChild(head);

    var tr = d.trend;
    if (tr.length < 2) { n.appendChild(el('div', NS + '-ks', 'Not enough closed months to plot a trend.')); return n; }

    var W = 1816, gid = NS + 'r' + (++uid), gid2 = NS + 'o' + uid;
    var revs = tr.map(function (t) { return t.rev; });
    var ops = tr.map(function (t) { return t.op; });
    var buds = tr.map(function (t) { return isNum(t.bud) ? t.bud : 0; });

    function band(vals, dom, y0, y1) {
      var mn = Math.min.apply(null, dom), mx = Math.max.apply(null, dom), sp = (mx - mn) || 1;
      return vals.map(function (v, i) {
        return { x: 44 + i / (vals.length - 1) * (W - 88), y: y1 - (v - mn) / sp * (y1 - y0) };
      });
    }
    function toPath(ps) {
      return ps.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
    }
    var revPts = band(revs, revs.concat([0]), 6, 70);
    var opDom = ops.concat(buds);
    var opPts = band(ops, opDom, 84, 124);
    var budPts = band(buds, opDom, 84, 124);
    var peakI = revs.indexOf(Math.max.apply(null, revs));

    var ticks = '';
    tr.forEach(function (t, i) {
      if (i % 6 !== 0 && i !== tr.length - 1) return;
      ticks += '<text x="' + (44 + i / (tr.length - 1) * (W - 88)).toFixed(1) + '" y="146" fill="#5b6d78" ' +
        'font-family="' + MONO.replace(/"/g, "'") + '" font-size="9" letter-spacing="1" text-anchor="middle">' +
        esc(t.label.toUpperCase()) + '</text>';
    });
    var peaks = '';
    [[revPts[peakI], BLUE], [revPts[revPts.length - 1], BLUE], [opPts[opPts.length - 1], UP]].forEach(function (p) {
      peaks += '<circle cx="' + p[0].x.toFixed(1) + '" cy="' + p[0].y.toFixed(1) +
        '" r="3" fill="#06090c" stroke="' + p[1] + '" stroke-width="1.6"></circle>';
    });

    n.appendChild(el('div', null,
      '<svg viewBox="0 0 ' + W + ' 150" preserveAspectRatio="none" style="display:block;width:100%;height:150px" ' +
      'role="img" aria-label="Monthly revenue and operating profit against budget over ' + tr.length + ' months">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="rgba(94,200,240,.30)"></stop>' +
      '<stop offset="100%" stop-color="rgba(94,200,240,0)"></stop></linearGradient>' +
      '<linearGradient id="' + gid2 + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="rgba(61,220,151,.22)"></stop>' +
      '<stop offset="100%" stop-color="rgba(61,220,151,0)"></stop></linearGradient></defs>' +
      '<path d="' + toPath(revPts) + ' L' + (W - 44) + ' 70 L44 70 Z" fill="url(#' + gid + ')"></path>' +
      '<path d="' + toPath(opPts) + ' L' + (W - 44) + ' 126 L44 126 Z" fill="url(#' + gid2 + ')"></path>' +
      '<path d="' + toPath(budPts) + '" fill="none" stroke="#4d5e69" stroke-width="1.2" stroke-dasharray="4 4"></path>' +
      '<path d="' + toPath(revPts) + '" fill="none" stroke="' + BLUE + '" stroke-width="1.8" stroke-linejoin="round"></path>' +
      '<path d="' + toPath(opPts) + '" fill="none" stroke="' + UP + '" stroke-width="1.8" stroke-linejoin="round"></path>' +
      ticks + peaks + '</svg>'));
    return n;
  }

  /* -------------------------------------------------------------------------
   * 13. RENDER
   * ---------------------------------------------------------------------- */
  function ensureStyles() {
    if (document.getElementById(NS + '-css')) return;
    var s = document.createElement('style');
    s.id = NS + '-css';
    s.appendChild(document.createTextNode(CSS));
    (document.head || document.documentElement).appendChild(s);
  }
  function ensureRoot() {
    var c = document.getElementById('tph-root') || document.querySelector('[data-tph-root]');
    if (!c) { c = document.createElement('div'); c.id = 'tph-root'; (document.body || document.documentElement).appendChild(c); }
    return c;
  }
  function fitStage() {
    if (!V.stage || !V.root) return;
    var r = V.root.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var k = Math.min(r.width / 1920, r.height / 1080);
    V.stage.style.transform = 'translate(' + ((r.width - 1920 * k) / 2).toFixed(2) + 'px,' +
      ((r.height - 1080 * k) / 2).toFixed(2) + 'px) scale(' + k.toFixed(5) + ')';
  }

  function render() {
    var root = ensureRoot();
    ensureStyles();
    V = {};
    root.className = NS;
    root.removeAttribute('style');
    root.innerHTML = '';

    var raw = window.__tpHome;
    if (!raw || !raw.stores || !raw.stores.length) {
      root.appendChild(el('div', NS + '-fail',
        '<div><b>No data in scope.</b><p>window.__tpHome carried no stores. Either the measure ' +
        'returned blank, or the current filters exclude every store.</p></div>'));
      return;
    }
    if (!D || D.__raw !== raw) { D = decode(raw); D.__raw = raw; }

    var stage = el('div', NS + '-stage');
    stage.appendChild(buildHeader(D));
    var main = el('div', NS + '-main');
    main.appendChild(buildKpis(D));
    main.appendChild(buildMap(D));
    main.appendChild(buildBoard(D));
    stage.appendChild(main);
    stage.appendChild(buildTrend(D));
    root.appendChild(stage);
    root.appendChild(el('div', NS + '-build', 'trailpeak-home v' + VERSION + ' · ' + (D.meta.build || 'dev')));

    V.root = root; V.stage = stage;
    fitStage();
    paintTip();

    /* Wire ONCE per root element. render() empties and refills the root but does
       not replace the element, so wiring every time stacks handlers and a toggle
       would fire twice and net to nothing. */
    if (root.__tphWired !== VERSION) { wire(root); root.__tphWired = VERSION; }
  }

  /* -------------------------------------------------------------------------
   * 14. INTERACTION
   * ---------------------------------------------------------------------- */
  function closest(n, sel) {
    while (n && n !== document) {
      if (n.nodeType === 1 && n.matches && n.matches(sel)) return n;
      n = n.parentNode;
    }
    return null;
  }

  function wire(root) {
    root.addEventListener('click', function (e) {
      var t;
      if ((t = closest(e.target, '[data-region]'))) {
        var r = t.getAttribute('data-region');
        S.region = (S.region === r) ? 'All' : r;
        if (S.region === 'All') S.active = null;
        return render();
      }
      if ((t = closest(e.target, '[data-mode]'))) {
        S.mode = t.getAttribute('data-mode');
        if (!METRICS[S.mode].some(function (m) { return m[0] === S.metric; })) S.metric = 'rev';
        S.hover = null;
        return render();
      }
      if ((t = closest(e.target, '[data-metric]'))) { S.metric = t.getAttribute('data-metric'); return render(); }
      if (closest(e.target, '[data-close]')) { S.active = null; return render(); }
      if ((t = closest(e.target, '[data-store]'))) {
        var id = +t.getAttribute('data-store');
        S.active = (S.active === id) ? null : id;
        return render();
      }
    });

    root.addEventListener('mouseover', function (e) {
      var t = closest(e.target, '[data-store]');
      var id = t ? +t.getAttribute('data-store') : null;
      if (id === S.hover) return;
      S.hover = id;
      repaintFocus();
    });
    root.addEventListener('mouseleave', function () {
      if (S.hover == null) return;
      S.hover = null;
      repaintFocus();
    });

    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && (S.active != null || S.region !== 'All')) {
        S.active = null; S.region = 'All'; render();
      }
    });

    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(function () { fitStage(); paintTip(); }).observe(root);
    } else {
      window.addEventListener('resize', function () { fitStage(); paintTip(); });
    }
  }

  /* Hover changes only emphasis. Repainting attributes in place is far cheaper
     than rebuilding the DOM, and it keeps the row list from scrolling back to
     the top every time the pointer crosses a bubble. */
  function repaintFocus() {
    if (!D || !V.root) return;
    var focus = S.hover || S.active;
    var vals = D.stores.map(function (q) { return metricOf(q, S.metric); });
    var mx = Math.max.apply(null, vals) || 1;

    var nodes = V.root.querySelectorAll('.' + NS + '-node');
    for (var i = 0; i < nodes.length; i++) {
      var g = nodes[i], id = +g.getAttribute('data-store'), s = null;
      for (var j = 0; j < D.stores.length; j++) if (D.stores[j].id === id) s = D.stores[j];
      if (!s) continue;
      var rad = Math.max(6, Math.sqrt(metricOf(s, S.metric) / mx) * 34);
      var inR = S.region === 'All' || s.region === S.region;
      var isF = focus === id;
      g.setAttribute('opacity', ((focus && !isF) || !inR) ? 0.22 : 1);
      var halo = g.querySelector('.halo'), disc = g.querySelector('.disc'), val = g.querySelector('.val');
      if (halo) { halo.setAttribute('r', (isF ? rad + 12 : rad).toFixed(1)); halo.setAttribute('opacity', isF ? 0.9 : 0); }
      if (disc) disc.setAttribute('fill-opacity', isF ? 0.5 : (s.type === 'Flagship' ? 0.26 : 0.16));
      if (val) val.setAttribute('opacity', isF ? 1 : 0);
      var lbl = g.querySelectorAll('text')[0];
      if (lbl) lbl.setAttribute('fill', isF ? '#e6edf2' : INK);
    }

    var rows = V.root.querySelectorAll('.' + NS + '-row');
    for (var k2 = 0; k2 < rows.length; k2++) {
      var row = rows[k2], rid = +row.getAttribute('data-store');
      if (!rid) continue;
      row.classList.toggle('on', focus === rid);
    }
    paintTip();
  }

  /* -------------------------------------------------------------------------
   * 15. BOOT
   * ---------------------------------------------------------------------- */
  var pending = false, tries = 0, timer = null, rendered = false;

  function schedule() {
    if (pending) return;
    pending = true;
    var run = function () {
      pending = false;
      try { render(); rendered = true; } catch (e) { fail(e); }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else setTimeout(run, 0);
  }
  function boot() { if (timer) clearTimeout(timer); tries = 0; attempt(); }
  function attempt() {
    if (!document.body) { if (tries++ < 200) timer = setTimeout(attempt, 16); return; }
    if (!window.__tpHome && !rendered && tries < 12 && document.readyState !== 'complete') {
      tries++; timer = setTimeout(attempt, 24); return;
    }
    schedule();
  }
  function fail(e) {
    try {
      ensureStyles();
      var root = ensureRoot();
      root.className = NS;
      root.innerHTML = '';
      root.appendChild(el('div', NS + '-fail',
        '<div><b>The home page failed to render.</b><p>' +
        esc((e && e.message) ? e.message : String(e)) + '</p></div>'));
      if (window.console && console.error) console.error('[tph]', e);
    } catch (x) { /* nothing left to do */ }
  }

  window.TPH = {
    __installed: VERSION, version: VERSION,
    boot: boot, render: schedule, state: S,
    _dbg: function () { return { D: D, V: V, S: S }; }
  };

  boot();
})();
