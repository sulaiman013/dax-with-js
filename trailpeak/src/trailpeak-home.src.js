/*!
 * TrailPeak Outfitters - HOME
 * The landing page of the report as one DAX measure and one HTML Content visual.
 * ---------------------------------------------------------------------------
 * Repo    : https://github.com/sulaiman013/dax-with-js
 * License : MIT
 *
 * BUILD: this file is GENERATED. Edit src/trailpeak-home.src.js and run
 *   node build-home.mjs
 * which injects the baked US geometry in place of the __BAKED_USMAP__ marker.
 *
 * WHY THE GEOMETRY IS BAKED
 * ---------------------------------------------------------------------------
 * The design prototype fetched d3 v7 (~280KB), topojson-client and
 * world-atlas countries-110m.json, then projected at runtime. Inside a Power BI
 * visual that is three requests from a null-origin iframe on a tenant that may
 * block any of them. Projection is a pure function of fixed inputs, so it moved
 * to build time: ~10KB of SVG path data replacing ~400KB of library and atlas.
 *
 * Typography is Segoe UI, deliberately. This page sits beside native Power BI
 * pages and has to look like it belongs to them, and Segoe UI is what Power BI
 * itself renders in. That also removes the last webfont request.
 *
 * WHY IT SHIPS GRAIN
 * ---------------------------------------------------------------------------
 * A native visual filters because the engine re-queries at grain. This visual
 * cannot re-query at all: nothing can be written back to the model. So the
 * browser holds store x month and product x store, and every click re-sums in
 * place. That is what makes a region chip behave like a slicer instead of a
 * dimmer switch.
 *
 * THREE THINGS THAT BREAK VISUALS LIKE THIS IN POWER BI
 * ---------------------------------------------------------------------------
 * 1. The host replaces the DOM on every cross-filter, resize and refresh, so
 *    this file is re-executed constantly. Install guard at the top; listeners
 *    wired once per root element, never once per render.
 * 2. Null origin. No cookies, no localStorage, no sessionStorage: they throw,
 *    they do not merely fail. UI state lives on window and is versioned.
 * 3. Nothing can be written back to the model. Page navigation is therefore
 *    native Power BI buttons sitting over the header band, not markup in here.
 *
 * THE DATA CONTRACT - window.__tpHome
 * ---------------------------------------------------------------------------
 *   meta  {through, first, last, cur, loc, build}
 *   dim.s [[key, code, name, city, state, region, tier, sqft], ...]
 *   dim.m [[key, label], ...]                                   chronological
 *   dim.p [[key, sku, name, category], ...]
 *   f     [storeKey, monthKey, rev, gp, ebitda, op, budRev, budOp, units, ...]
 *                                                               stride 9
 *   x     [prodKey, storeKey, rev, units, gp, ...]              stride 5
 *
 * Money is integer minor units and ratios integer basis points. Blanks arrive
 * as null, never 0. Store coordinates are pre-projected into US_XY by
 * StoreCode: geography is renderer reference data, not model data.
 */
(function () {
  'use strict';

  var VERSION = '3.0.0';
  var NS = 'tph';

  /* -------------------------------------------------------------------------
   * 1. INSTALL GUARD
   * ---------------------------------------------------------------------- */
  if (window.TPH && window.TPH.__installed === VERSION && typeof window.TPH.boot === 'function') {
    window.TPH.boot();
    return;
  }

  /* -------------------------------------------------------------------------
   * 2. BAKED GEOMETRY (injected by build-home.mjs)
   * ---------------------------------------------------------------------- */
  /*__BAKED_USMAP__*/

  /* -------------------------------------------------------------------------
   * 3. DESIGN TOKENS
   * Sampled from the main report page so the two read as one product.
   * ---------------------------------------------------------------------- */
  var GRN_D = '#0e4d2b',   /* header band, dark end   */
      GRN_M = '#2e7d4f',   /* header band, light end  */
      GRN   = '#107c41',   /* positive / accent       */
      GRN_B = '#1e6b43',   /* solid data green        */
      RED   = '#c4314b',   /* negative                */
      AMB   = '#c77700',   /* behind budget on the map */
      INK   = '#1b1b1b',
      MUTE  = '#616e7c',
      FAINT = '#8a949e',
      LINE  = '#e5e7e9',
      PANEL = '#ffffff',
      BG    = '#f2f3f4';

  var REGION_COLOR = { Mountain: '#1e6b43', Pacific: '#2b7a9b', Midwest: '#6b4fa0', Southwest: '#b5701f' };
  var CAT_COLOR = {
    'Camping & Hiking': '#1e6b43', 'Climbing': '#6b4fa0', 'Accessories': '#2b7a9b',
    'Winter Sports': '#3f7f9e', 'Apparel': '#b5701f', 'Footwear': '#9b4a6d'
  };

  var UI = "'Segoe UI','Segoe UI Web (West European)',system-ui,-apple-system,Roboto,Arial,sans-serif";

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

  /* The header band leaves this slot empty. Native Power BI page-navigation
     buttons are positioned over it in the PBIR definition, because a custom
     visual has no handle on IVisualHost and cannot navigate pages itself. */
  var NAV_SLOT = { x: 690, w: 540 };

  /* -------------------------------------------------------------------------
   * 4. STYLES
   * ---------------------------------------------------------------------- */
  var CSS = [
    '.tph{position:absolute;inset:0;overflow:hidden;background:' + BG + ';font-family:' + UI + ';',
    '  color:' + INK + ';-webkit-font-smoothing:antialiased;contain:strict;font-size:13px}',
    '.tph *,.tph *::before,.tph *::after{box-sizing:border-box}',
    '.tph-stage{position:absolute;top:0;left:0;width:1920px;height:1080px;transform-origin:0 0;',
    '  background:' + BG + ';display:flex;flex-direction:column;overflow:hidden}',
    '.tph em{font-style:normal;font-variant-numeric:tabular-nums}',

    /* ---- header band ---- */
    '.tph-hd{flex:0 0 auto;height:76px;display:flex;align-items:center;justify-content:space-between;',
    '  padding:0 26px;background:linear-gradient(90deg,' + GRN_D + ' 0%,' + GRN_M + ' 100%);color:#fff}',
    '.tph-hd h1{margin:0;font-size:20px;font-weight:600;letter-spacing:-.01em;line-height:1.15}',
    '.tph-hd p{margin:3px 0 0;font-size:10.5px;letter-spacing:.14em;color:rgba(255,255,255,.72);',
    '  text-transform:uppercase}',
    '.tph-hdr{text-align:right}',
    '.tph-hdr b{display:block;font-size:15px;font-weight:600}',
    '.tph-hdr span{display:block;font-size:11px;color:rgba(255,255,255,.75);margin-top:2px}',

    /* ---- filter bar ---- */
    '.tph-fb{flex:0 0 auto;display:flex;align-items:center;gap:14px;padding:10px 26px;',
    '  background:' + PANEL + ';border-bottom:1px solid ' + LINE + '}',
    '.tph-fl{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:' + FAINT + ';flex:0 0 auto}',
    '.tph-chips{display:flex;gap:6px;flex:0 0 auto}',
    '.tph-chip{cursor:pointer;font-family:inherit;font-size:12px;padding:5px 13px;border-radius:14px;',
    '  border:1px solid #d0d4d8;background:#fff;color:#333;transition:all .14s ease;white-space:nowrap}',
    '.tph-chip:hover{border-color:' + GRN + ';color:' + GRN + '}',
    '.tph-chip.on{background:' + GRN + ';border-color:' + GRN + ';color:#fff;font-weight:600}',
    '.tph-sel{font-family:inherit;font-size:12px;padding:5px 8px;border-radius:4px;border:1px solid #d0d4d8;',
    '  background:#fff;color:#333;min-width:150px;cursor:pointer}',
    '.tph-stat{margin-left:auto;font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;',
    '  color:' + FAINT + ';white-space:nowrap}',
    '.tph-reset{cursor:pointer;font-family:inherit;font-size:11.5px;padding:5px 12px;border-radius:4px;',
    '  border:1px solid #d0d4d8;background:#fff;color:' + MUTE + ';flex:0 0 auto}',
    '.tph-reset:hover{border-color:' + RED + ';color:' + RED + '}',
    '.tph-reset[disabled]{opacity:.4;cursor:default}',

    /* ---- KPI strip ---- */
    '.tph-kpis{flex:0 0 auto;display:grid;grid-template-columns:repeat(6,1fr);gap:10px;padding:12px 26px 0}',
    '.tph-kpi{background:' + PANEL + ';border:1px solid ' + LINE + ';border-radius:6px;padding:11px 14px 12px;',
    '  position:relative;overflow:hidden}',
    '.tph-kpi.acc::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:' + RED + '}',
    '.tph-kl{font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:' + FAINT + '}',
    '.tph-kv{margin-top:6px;font-size:26px;font-weight:600;letter-spacing:-.02em;line-height:1.1;',
    '  font-variant-numeric:tabular-nums}',
    '.tph-ks{margin-top:5px;font-size:11.5px;color:' + MUTE + ';font-variant-numeric:tabular-nums}',

    /* ---- main grid ---- */
    '.tph-main{flex:1 1 auto;display:grid;grid-template-columns:1fr 470px;gap:10px;padding:10px 26px 0;min-height:0}',
    /* Grid and flex children default to min-height:auto, which means they
       refuse to shrink below their content and happily overflow the row. Every
       level of this stack has to opt out explicitly or the league table pushes
       past the bottom of the page. */
    '.tph-main>*{min-height:0}',
    '.tph-col{display:flex;flex-direction:column;gap:10px;min-height:0}',
    '.tph-card{background:' + PANEL + ';border:1px solid ' + LINE + ';border-radius:6px;display:flex;',
    '  flex-direction:column;min-height:0;overflow:hidden}',
    /* The map card is the one element that should absorb the leftover height.
       Without this it sizes to its header and legend, the SVG gets zero rows to
       paint into, and the map silently disappears. */
    '.tph-col>.tph-card{flex:1 1 auto}',
    '.tph-ch{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:11px 16px 8px}',
    '.tph-ch h2{margin:0;font-size:14px;font-weight:600}',
    '.tph-ch small{font-size:11.5px;color:' + FAINT + '}',
    '.tph-ch .r{margin-left:auto;display:flex;gap:6px;align-items:center}',
    '.tph-hint{font-size:11px;color:' + FAINT + '}',

    /* ---- map ---- */
    '.tph-mapw{flex:1 1 auto;min-height:120px;position:relative}',
    '.tph-mapw svg{position:absolute;inset:0;width:100%;height:100%;display:block}',
    '.tph-node{cursor:pointer;transition:opacity .16s ease}',
    '.tph-legend{flex:0 0 auto;display:flex;align-items:center;gap:20px;padding:0 16px 11px;',
    '  font-size:11px;color:' + MUTE + '}',
    '.tph-legend span{display:flex;align-items:center;gap:6px}',
    '.tph-legend i{width:9px;height:9px;border-radius:50%;font-style:normal}',
    '.tph-legend .r{margin-left:auto;color:' + FAINT + '}',

    /* ---- trend ---- */
    '.tph-trend{flex:0 0 186px}',
    '.tph-tl{display:flex;gap:16px;font-size:11px;color:' + MUTE + '}',
    '.tph-tl span{display:flex;align-items:center;gap:6px}',
    '.tph-tl i{width:14px;height:2px;font-style:normal}',
    '.tph-tsvg{flex:1 1 auto;min-height:0;padding:0 16px 8px}',
    '.tph-tsvg svg{display:block;width:100%;height:100%}',

    /* ---- leaderboard ---- */
    '.tph-seg{display:flex;border:1px solid #d0d4d8;border-radius:4px;overflow:hidden}',
    '.tph-seg button{cursor:pointer;border:none;font-family:inherit;font-size:11.5px;padding:5px 13px;',
    '  background:#fff;color:' + MUTE + ';transition:all .14s ease}',
    '.tph-seg button+button{border-left:1px solid #d0d4d8}',
    '.tph-seg button.on{background:' + GRN + ';color:#fff;font-weight:600}',
    '.tph-mtabs{flex:0 0 auto;display:flex;gap:6px;padding:0 16px 8px}',
    '.tph-mtabs button{cursor:pointer;flex:1 1 0;font-family:inherit;font-size:11px;padding:6px 0;',
    '  border-radius:4px;background:#fff;border:1px solid #d0d4d8;color:' + MUTE + ';transition:all .14s ease}',
    '.tph-mtabs button.on{background:rgba(16,124,65,.10);border-color:' + GRN + ';color:' + GRN + ';font-weight:600}',

    '.tph-rows{flex:1 1 auto;min-height:0;overflow:auto;padding:0 8px 10px}',
    '.tph-rows::-webkit-scrollbar{width:8px}',
    '.tph-rows::-webkit-scrollbar-thumb{background:#d6d9dc;border-radius:4px}',
    '.tph-rhd{display:grid;grid-template-columns:24px 1fr 92px 78px;gap:8px;padding:0 8px 5px;',
    '  font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:' + FAINT + ';',
    '  position:sticky;top:0;background:' + PANEL + ';z-index:1}',
    '.tph-rhd span:nth-child(3),.tph-rhd span:nth-child(4){text-align:right}',
    '.tph-row{display:grid;grid-template-columns:24px 1fr 92px 78px;gap:8px;align-items:center;',
    '  padding:5px 8px;border-radius:4px;cursor:pointer;transition:background .14s ease,opacity .14s ease;',
    '  border-bottom:1px solid #f0f1f2}',
    '.tph-row:hover{background:#f6f7f8}',
    '.tph-row.on{background:rgba(16,124,65,.09)}',
    '.tph-row.off{opacity:.34}',
    '.tph-rk{font-size:11px;color:' + FAINT + ';font-variant-numeric:tabular-nums}',
    '.tph-rm{min-width:0}',
    '.tph-rt{display:flex;align-items:center;gap:7px}',
    '.tph-rt i{width:8px;height:8px;border-radius:2px;flex:0 0 auto;font-style:normal}',
    '.tph-rt b{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.tph-bar{height:4px;border-radius:2px;background:#eceef0;overflow:hidden;margin-top:4px}',
    '.tph-bar i{display:block;height:100%;border-radius:2px;font-style:normal;',
    '  transition:width .45s cubic-bezier(.22,1,.36,1)}',
    '.tph-rs{display:block;font-size:10.5px;color:' + FAINT + ';margin-top:3px}',
    '.tph-rv{text-align:right;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}',
    '.tph-rd{text-align:right;font-size:11.5px;font-variant-numeric:tabular-nums}',

    '.tph-detail{flex:0 0 auto;margin:0 16px 10px;padding:11px 13px;border-radius:5px;',
    '  background:rgba(16,124,65,.07);border:1px solid rgba(16,124,65,.28)}',
    '.tph-dh{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}',
    '.tph-dh h3{margin:0;font-size:14px;font-weight:600}',
    '.tph-dh p{margin:2px 0 0;font-size:11px;color:' + MUTE + '}',
    '.tph-dh button{cursor:pointer;background:#fff;border:1px solid #d0d4d8;color:' + MUTE + ';',
    '  border-radius:4px;font-family:inherit;font-size:11px;padding:4px 9px;flex:0 0 auto}',
    '.tph-dh button:hover{border-color:' + RED + ';color:' + RED + '}',
    '.tph-dg{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:10px}',
    '.tph-dg div span:first-child{display:block;font-size:9.5px;letter-spacing:.1em;',
    '  text-transform:uppercase;color:' + FAINT + '}',
    '.tph-dg div span:last-child{display:block;margin-top:3px;font-size:14px;font-weight:600;',
    '  font-variant-numeric:tabular-nums}',

    '.tph-build{position:absolute;right:10px;bottom:5px;font-size:9px;color:#c3c8cc;pointer-events:none}',
    '.tph-empty{padding:26px 16px;font-size:12.5px;color:' + FAINT + ';text-align:center}',
    '.tph-fail{position:absolute;inset:0;display:grid;place-items:center;background:' + BG + ';padding:40px;',
    '  text-align:center}',
    '.tph-fail b{display:block;font-size:16px;color:' + RED + ';margin-bottom:9px}',
    '.tph-fail p{margin:0;font-size:13px;line-height:1.65;color:' + MUTE + ';max-width:620px}'
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
  function dollars(c) {
    if (!isNum(c)) return '—';
    return (c < 0 ? '-$' : '$') + Math.round(Math.abs(c) / 100).toLocaleString('en-US');
  }
  function pct(x, dp) { return !isNum(x) ? '—' : (x * 100).toFixed(dp == null ? 1 : dp) + '%'; }
  function thou(n) { return !isNum(n) ? '—' : Math.round(n).toLocaleString('en-US'); }
  function signed(c) { return !isNum(c) ? '—' : (c >= 0 ? '+' : '') + dollars(c); }

  /* -------------------------------------------------------------------------
   * 6. STATE
   * Versioned: it survives the DOM replacement, which is the point, but it must
   * not survive a build that changes what the fields mean.
   * ---------------------------------------------------------------------- */
  var S = window.__tphState;
  if (!S || S.v !== VERSION) {
    S = window.__tphState = {
      v: VERSION, regions: [], store: null, cats: [],
      mode: 'stores', metric: 'rev', hover: null
    };
  }

  var D = null, V = {}, uid = 0;

  /* -------------------------------------------------------------------------
   * 7. DECODE
   * ---------------------------------------------------------------------- */
  function decode(raw) {
    var d = { meta: raw.meta || {}, stores: [], months: [], products: [], f: raw.f || [], x: raw.x || [] };
    (raw.dim && raw.dim.s || []).forEach(function (s) {
      var lp = LABEL[s[1]] || {}, xy = US_XY[s[1]];
      d.stores.push({
        k: s[0], code: s[1], name: s[2], city: s[3], st: s[4], region: s[5], tier: s[6], sqft: s[7],
        x: xy ? xy[0] : null, y: xy ? xy[1] : null,
        dx: lp.dx || 0, dy: lp.dy || 0, anchor: lp.anchor || 'start'
      });
    });
    (raw.dim && raw.dim.m || []).forEach(function (m) { d.months.push({ k: m[0], label: m[1] }); });
    (raw.dim && raw.dim.p || []).forEach(function (p) {
      d.products.push({ k: p[0], sku: p[1], name: p[2], cat: p[3] });
    });

    d.storeBy = {}; d.stores.forEach(function (s) { d.storeBy[s.k] = s; });
    d.monthIx = {}; d.months.forEach(function (m, i) { d.monthIx[m.k] = i; });
    d.prodBy = {}; d.products.forEach(function (p) { d.prodBy[p.k] = p; });

    d.regions = [];
    d.stores.forEach(function (s) { if (d.regions.indexOf(s.region) < 0) d.regions.push(s.region); });
    d.regions.sort();
    d.cats = [];
    d.products.forEach(function (p) { if (d.cats.indexOf(p.cat) < 0) d.cats.push(p.cat); });
    d.cats.sort();
    return d;
  }

  /* -------------------------------------------------------------------------
   * 8. THE FILTER MODEL
   *
   * Two levels, deliberately, because that is how a native page behaves:
   *
   *   SCOPE    the region chips. A slicer. Everything obeys it, including the
   *            store league table and the map.
   *   FOCUS    a selected store. A cross-filter. The KPI strip, the trend and
   *            the product table re-scope to it, while the store table and the
   *            map keep every in-scope store visible and merely highlight it,
   *            which is exactly what a native bar chart does when you click one
   *            of its bars.
   * ---------------------------------------------------------------------- */
  function inScope(s) { return !S.regions.length || S.regions.indexOf(s.region) >= 0; }

  function scopeStores() { return D.stores.filter(inScope); }

  function focusSet() {
    var out = {}, list = scopeStores();
    if (S.store != null && D.storeBy[S.store] && inScope(D.storeBy[S.store])) out[S.store] = 1;
    else list.forEach(function (s) { out[s.k] = 1; });
    return out;
  }

  function catSet() {
    if (!S.cats.length) return null;
    var m = {};
    D.products.forEach(function (p) { if (S.cats.indexOf(p.cat) >= 0) m[p.k] = 1; });
    return m;
  }

  /* Sum store x month over a store set. One linear pass, no allocation per row. */
  function aggregate(sset) {
    var f = D.f, nM = D.months.length;
    var tot = { rev: 0, gp: 0, eb: 0, op: 0, br: 0, bo: 0, un: 0 };
    var byM = [];
    for (var i = 0; i < nM; i++) byM.push({ rev: 0, gp: 0, op: 0, bo: 0, br: 0 });
    for (var j = 0; j < f.length; j += 9) {
      if (!sset[f[j]]) continue;
      var mi = D.monthIx[f[j + 1]];
      var rev = f[j + 2] || 0, gp = f[j + 3] || 0, eb = f[j + 4] || 0,
          op = f[j + 5] || 0, br = f[j + 6] || 0, bo = f[j + 7] || 0, un = f[j + 8] || 0;
      tot.rev += rev; tot.gp += gp; tot.eb += eb; tot.op += op;
      tot.br += br; tot.bo += bo; tot.un += un;
      if (mi != null) {
        var m = byM[mi];
        m.rev += rev; m.gp += gp; m.op += op; m.bo += bo; m.br += br;
      }
    }
    return { tot: tot, byM: byM };
  }

  /* Per-store totals over the whole in-scope period. */
  function byStore() {
    var f = D.f, out = {};
    D.stores.forEach(function (s) { out[s.k] = { rev: 0, gp: 0, eb: 0, op: 0, bo: 0, un: 0 }; });
    for (var j = 0; j < f.length; j += 9) {
      var o = out[f[j]];
      if (!o) continue;
      o.rev += f[j + 2] || 0; o.gp += f[j + 3] || 0; o.eb += f[j + 4] || 0;
      o.op += f[j + 5] || 0; o.bo += f[j + 7] || 0; o.un += f[j + 8] || 0;
    }
    return out;
  }

  /* Product totals over a store set. This is the array that makes the product
     league table follow the region chips instead of ignoring them. */
  function byProduct(sset) {
    var x = D.x, out = {}, cs = catSet();
    for (var j = 0; j < x.length; j += 5) {
      var pk = x[j];
      if (!sset[x[j + 1]]) continue;
      if (cs && !cs[pk]) continue;
      var o = out[pk] || (out[pk] = { rev: 0, un: 0, gp: 0 });
      o.rev += x[j + 2] || 0; o.un += x[j + 3] || 0; o.gp += x[j + 4] || 0;
    }
    return out;
  }

  /* -------------------------------------------------------------------------
   * 9. HEADER + FILTER BAR
   * ---------------------------------------------------------------------- */
  function buildHeader(d) {
    var n = el('div', NS + '-hd');
    var b = el('div');
    b.appendChild(el('h1', null, esc('TrailPeak Outfitters')));
    b.appendChild(el('p', null, 'Finance · Monthly Reporting'));
    n.appendChild(b);

    /* Deliberately empty. Native page-navigation buttons live over this slot. */
    var slot = el('div');
    slot.style.cssText = 'width:' + NAV_SLOT.w + 'px;flex:0 0 auto';
    slot.setAttribute('aria-hidden', 'true');
    n.appendChild(slot);

    var r = el('div', NS + '-hdr');
    r.appendChild(el('b', null, esc((d.meta.first || '') + ' – ' + (d.meta.last || ''))));
    r.appendChild(el('span', null, esc(d.meta.through || '')));
    n.appendChild(r);
    return n;
  }

  function buildFilterBar(d) {
    var n = el('div', NS + '-fb');

    n.appendChild(el('span', NS + '-fl', 'Region'));
    var rc = el('div', NS + '-chips');
    d.regions.forEach(function (r) {
      var b = el('button', NS + '-chip' + (S.regions.indexOf(r) >= 0 ? ' on' : ''), esc(r));
      b.type = 'button';
      b.setAttribute('data-region', r);
      b.setAttribute('aria-pressed', S.regions.indexOf(r) >= 0 ? 'true' : 'false');
      rc.appendChild(b);
    });
    n.appendChild(rc);

    n.appendChild(el('span', NS + '-fl', 'Store'));
    var sel = el('select', NS + '-sel');
    sel.setAttribute('data-storesel', '1');
    sel.setAttribute('aria-label', 'Filter to a single store');
    var opts = '<option value="">All stores</option>';
    scopeStores().forEach(function (s) {
      opts += '<option value="' + s.k + '"' + (S.store === s.k ? ' selected' : '') + '>' +
        esc(s.name) + '</option>';
    });
    sel.innerHTML = opts;
    n.appendChild(sel);

    n.appendChild(el('span', NS + '-fl', 'Category'));
    var cc = el('div', NS + '-chips');
    d.cats.forEach(function (c) {
      var b = el('button', NS + '-chip' + (S.cats.indexOf(c) >= 0 ? ' on' : ''), esc(c));
      b.type = 'button';
      b.setAttribute('data-cat', c);
      b.setAttribute('aria-pressed', S.cats.indexOf(c) >= 0 ? 'true' : 'false');
      cc.appendChild(b);
    });
    n.appendChild(cc);

    var scope = scopeStores(), focus = focusSet();
    var nFocus = Object.keys(focus).length;
    var nCats = S.cats.length || d.cats.length;
    n.appendChild(el('span', NS + '-stat',
      d.months.length + ' months · ' + nFocus + ' of ' + d.stores.length + ' stores · ' +
      nCats + ' of ' + d.cats.length + ' categories'));

    var rb = el('button', NS + '-reset', 'Reset all');
    rb.type = 'button';
    rb.setAttribute('data-reset', '1');
    if (!S.regions.length && S.store == null && !S.cats.length) rb.disabled = true;
    n.appendChild(rb);
    return n;
  }

  /* -------------------------------------------------------------------------
   * 10. KPI STRIP
   * ---------------------------------------------------------------------- */
  function buildKpis(d, agg) {
    var wrap = el('div', NS + '-kpis');
    var t = agg.tot;
    var gm = t.rev ? t.gp / t.rev : null;
    var ebPct = t.rev ? t.eb / t.rev : null;
    var opPct = t.rev ? t.op / t.rev : null;
    var revVar = t.rev - t.br;
    var opVar = t.op - t.bo;

    /* The vital few, recomputed under the current filter. A top-20% computed at
       company level is the wrong 20% the moment someone picks a region. */
    var prod = byProduct(focusSet());
    var pv = Object.keys(prod).map(function (k) { return prod[k].rev; }).sort(function (a, b) { return b - a; });
    var totP = pv.reduce(function (a, b) { return a + b; }, 0);
    var run = 0, vital = 0;
    for (var i = 0; i < pv.length; i++) { run += pv[i]; vital++; if (run >= totP * 0.8) break; }

    var items = [
      { l: 'Net revenue', v: dollars(t.rev),
        s: signed(revVar) + ' vs budget', c: revVar >= 0 ? GRN : RED },
      { l: 'Gross profit', v: dollars(t.gp), s: pct(gm) + ' margin', c: MUTE },
      { l: 'EBITDA', v: dollars(t.eb), s: pct(ebPct) + ' of revenue', c: MUTE },
      { l: 'Operating profit', v: dollars(t.op),
        s: signed(opVar) + ' vs budget', c: opVar >= 0 ? GRN : RED, acc: opVar < 0 },
      { l: 'Units sold', v: thou(t.un), s: dollars(totP) + ' product revenue', c: MUTE },
      { l: 'Vital few', v: vital + ' of ' + pv.length, s: 'SKUs drive 80%', c: MUTE }
    ];

    items.forEach(function (it) {
      var c = el('div', NS + '-kpi' + (it.acc ? ' acc' : ''));
      c.appendChild(el('div', NS + '-kl', esc(it.l)));
      c.appendChild(el('div', NS + '-kv', esc(it.v)));
      var s = el('div', NS + '-ks', esc(it.s));
      s.style.color = it.c;
      c.appendChild(s);
      wrap.appendChild(c);
    });
    return wrap;
  }

  /* -------------------------------------------------------------------------
   * 11. MAP
   * ---------------------------------------------------------------------- */
  function buildMap(d, tots) {
    var panel = el('div', NS + '-card');
    var head = el('div', NS + '-ch');
    head.appendChild(el('h2', null, 'Store network'));
    var scope = scopeStores();
    head.appendChild(el('small', null, scope.length + ' stores · bubble = ' +
      (S.metric === 'op' ? 'operating profit' : S.metric === 'gm' ? 'margin' : 'revenue')));
    head.appendChild(el('span', NS + '-hint r', 'Click a store to cross-filter the page'));
    panel.appendChild(head);

    var wrap = el('div', NS + '-mapw');
    var gid = NS + 'g' + (++uid), cid = NS + 'c' + uid;

    function mval(k) {
      var o = tots[k] || {};
      return S.metric === 'op' ? Math.max(0, o.op) : S.metric === 'gm' ? (o.rev ? o.gp / o.rev * 1e6 : 0) : o.rev;
    }
    var mx = 1;
    scope.forEach(function (s) { mx = Math.max(mx, mval(s.k)); });

    var nodes = '';
    d.stores.forEach(function (s, i) {
      if (s.x == null) return;
      var sc = inScope(s);
      var o = tots[s.k] || { rev: 0, op: 0, bo: 0 };
      var rad = sc ? Math.max(6, Math.sqrt(mval(s.k) / mx) * 34) : 6;
      var ahead = (o.op - o.bo) >= 0;
      var col = ahead ? GRN_B : AMB;
      var isF = (S.hover || S.store) === s.k;
      var dim = !sc || ((S.hover || S.store) != null && !isF);
      var lx = s.dx + (s.anchor === 'end' ? -rad : s.anchor === 'middle' ? 0 : rad);
      var ly = s.dy + (s.anchor === 'middle' ? (s.dy < 0 ? -rad + 4 : rad - 2) : 4);

      nodes +=
        '<g class="' + NS + '-node" data-store="' + s.k + '" transform="translate(' + s.x + ',' + s.y + ')" ' +
        'opacity="' + (dim ? 0.24 : 1) + '" tabindex="0" role="button" aria-label="' +
        esc(s.name + ', ' + dollars(o.rev)) + '">' +
        (sc ? '<circle r="' + (rad * 2.2).toFixed(1) + '" fill="url(#' + gid + ')"></circle>' : '') +
        '<circle r="' + (isF ? rad + 9 : rad).toFixed(1) + '" fill="none" stroke="' + col +
        '" stroke-width="1.4" opacity="' + (isF ? 0.85 : 0) + '"></circle>' +
        '<circle r="' + rad.toFixed(1) + '" fill="' + col + '" fill-opacity="' +
        (isF ? 0.55 : (s.tier === 'Flagship' ? 0.34 : 0.22)) + '" stroke="' + col +
        '" stroke-width="' + (s.tier === 'Flagship' ? 1.6 : 1.1) + '"></circle>' +
        '<circle r="' + Math.max(1.8, rad * 0.14).toFixed(1) + '" fill="' + col + '"></circle>' +
        '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="' + s.anchor +
        '" font-family="' + UI.replace(/"/g, "'") + '" font-size="10.5" fill="' +
        (isF ? INK : MUTE) + '" font-weight="' + (isF ? 600 : 400) + '">' + esc(s.city) + '</text>' +
        (isF ? '<text x="' + lx.toFixed(1) + '" y="' + (ly + 12).toFixed(1) + '" text-anchor="' + s.anchor +
          '" font-family="' + UI.replace(/"/g, "'") + '" font-size="10.5" fill="' + col +
          '" font-weight="600">' + esc(dollars(o.rev)) + '</text>' : '') +
        '</g>';
    });

    wrap.innerHTML =
      '<svg viewBox="' + US_VIEWBOX + '" preserveAspectRatio="xMidYMid meet" role="img" ' +
      'aria-label="Map of the United States with store locations sized by revenue">' +
      '<defs><radialGradient id="' + gid + '">' +
      '<stop offset="0%" stop-color="rgba(30,107,67,.16)"></stop>' +
      '<stop offset="100%" stop-color="rgba(30,107,67,0)"></stop></radialGradient>' +
      '<clipPath id="' + cid + '"><path d="' + US_LAND + '"></path></clipPath></defs>' +
      '<path d="' + US_LAND + '" fill="#eef1f0" stroke="#c9d2ce" stroke-width="1" stroke-linejoin="round"></path>' +
      '<path d="' + US_GRAT + '" fill="none" stroke="rgba(0,0,0,.035)" stroke-width="0.5" ' +
      'clip-path="url(#' + cid + ')"></path>' +
      '<g>' + nodes + '</g></svg>';
    panel.appendChild(wrap);

    var lg = el('div', NS + '-legend');
    lg.innerHTML =
      '<span><i style="background:' + GRN_B + ';opacity:.45;border:1px solid ' + GRN_B + '"></i>Ahead of budget</span>' +
      '<span><i style="background:' + AMB + ';opacity:.45;border:1px solid ' + AMB + '"></i>Behind budget</span>' +
      '<span class="r">Bubble area is proportional to the selected measure</span>';
    panel.appendChild(lg);
    return panel;
  }

  /* -------------------------------------------------------------------------
   * 12. TREND
   * ---------------------------------------------------------------------- */
  function buildTrend(d, agg) {
    var n = el('div', NS + '-card ' + NS + '-trend');
    var head = el('div', NS + '-ch');
    head.appendChild(el('h2', null, 'Revenue and operating profit by month'));
    head.appendChild(el('small', null, d.months.length + ' closed months'));
    head.appendChild(el('div', NS + '-tl r',
      '<span><i style="background:' + GRN_B + '"></i>Revenue</span>' +
      '<span><i style="background:' + GRN + '"></i>Operating profit</span>' +
      '<span><i style="background:#a9b2ba"></i>Budget</span>'));
    n.appendChild(head);

    var m = agg.byM;
    if (m.length < 2) { n.appendChild(el('div', NS + '-empty', 'Not enough closed months to plot a trend.')); return n; }

    var W = 1000, H = 118, PADL = 8, PADR = 8, gid = NS + 't' + (++uid);
    var revs = m.map(function (r) { return r.rev; });
    var ops = m.map(function (r) { return r.op; });
    var bos = m.map(function (r) { return r.bo; });

    function band(vals, dom, y0, y1) {
      var mn = Math.min.apply(null, dom), mx = Math.max.apply(null, dom), sp = (mx - mn) || 1;
      return vals.map(function (v, i) {
        return { x: PADL + i / (vals.length - 1) * (W - PADL - PADR), y: y1 - (v - mn) / sp * (y1 - y0) };
      });
    }
    function toPath(ps) {
      return ps.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
    }
    var revPts = band(revs, revs.concat([0]), 6, 58);
    var opDom = ops.concat(bos);
    var opPts = band(ops, opDom, 70, 104);
    var boPts = band(bos, opDom, 70, 104);

    var ticks = '';
    m.forEach(function (r, i) {
      if (i % 6 !== 0 && i !== m.length - 1) return;
      ticks += '<text x="' + (PADL + i / (m.length - 1) * (W - PADL - PADR)).toFixed(1) + '" y="116" ' +
        'fill="' + FAINT + '" font-family="' + UI.replace(/"/g, "'") + '" font-size="9" text-anchor="' +
        (i === 0 ? 'start' : i === m.length - 1 ? 'end' : 'middle') + '">' +
        esc(d.months[i] ? d.months[i].label : '') + '</text>';
    });

    var wrap = el('div', NS + '-tsvg');
    wrap.innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" ' +
      'aria-label="Monthly revenue and operating profit against budget">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="rgba(30,107,67,.22)"></stop>' +
      '<stop offset="100%" stop-color="rgba(30,107,67,.02)"></stop></linearGradient></defs>' +
      '<path d="' + toPath(revPts) + ' L' + (W - PADR) + ' 58 L' + PADL + ' 58 Z" fill="url(#' + gid + ')"></path>' +
      '<path d="' + toPath(revPts) + '" fill="none" stroke="' + GRN_B + '" stroke-width="1.8" ' +
      'stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>' +
      '<path d="' + toPath(boPts) + '" fill="none" stroke="#a9b2ba" stroke-width="1.2" ' +
      'stroke-dasharray="4 4" vector-effect="non-scaling-stroke"></path>' +
      '<path d="' + toPath(opPts) + '" fill="none" stroke="' + GRN + '" stroke-width="1.8" ' +
      'stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>' +
      ticks + '</svg>';
    n.appendChild(wrap);
    return n;
  }

  /* -------------------------------------------------------------------------
   * 13. LEADERBOARD
   * ---------------------------------------------------------------------- */
  var METRICS = {
    stores: [['rev', 'Revenue'], ['op', 'Op profit'], ['gm', 'Margin']],
    products: [['rev', 'Revenue'], ['op', 'Gross profit'], ['gm', 'Units']]
  };

  function buildBoard(d, tots) {
    var panel = el('div', NS + '-card');
    var head = el('div', NS + '-ch');
    head.appendChild(el('h2', null, "Who's winning"));
    var seg = el('div', NS + '-seg r');
    [['stores', 'Stores'], ['products', 'Products']].forEach(function (m) {
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

    if (S.mode === 'stores' && S.store != null && d.storeBy[S.store]) {
      panel.appendChild(buildDetail(d.storeBy[S.store], tots[S.store] || {}));
    }

    var rows = el('div', NS + '-rows');
    var hd = el('div', NS + '-rhd');

    if (S.mode === 'stores') {
      hd.innerHTML = '<span>#</span><span>Store</span><span>' +
        esc(METRICS.stores.filter(function (m) { return m[0] === S.metric; })[0][1]) +
        '</span><span>vs budget</span>';
      rows.appendChild(hd);

      var scope = scopeStores();
      var valOf = function (s) {
        var o = tots[s.k] || {};
        return S.metric === 'op' ? o.op : S.metric === 'gm' ? (o.rev ? o.gp / o.rev : 0) : o.rev;
      };
      var list = scope.slice().sort(function (a, b) { return valOf(b) - valOf(a); });
      var mx = Math.max.apply(null, list.map(function (s) { return Math.abs(valOf(s)); })) || 1;

      if (!list.length) rows.appendChild(el('div', NS + '-empty', 'No stores match the current filters.'));

      list.forEach(function (s, i) {
        var o = tots[s.k] || { rev: 0, op: 0, bo: 0, gp: 0 };
        var isF = (S.hover || S.store) === s.k;
        var dimmed = S.store != null && S.store !== s.k;
        var v = valOf(s), vr = o.op - o.bo;
        var row = el('div', NS + '-row' + (isF ? ' on' : '') + (dimmed ? ' off' : ''));
        row.setAttribute('data-store', s.k);
        row.setAttribute('tabindex', '0');
        row.innerHTML =
          '<span class="' + NS + '-rk">' + (i + 1) + '</span>' +
          '<div class="' + NS + '-rm"><div class="' + NS + '-rt"><i style="background:' +
          (REGION_COLOR[s.region] || GRN_B) + '"></i><b>' + esc(s.name) + '</b></div>' +
          '<div class="' + NS + '-bar"><i style="width:' + Math.round(Math.abs(v) / mx * 100) +
          '%;background:' + (REGION_COLOR[s.region] || GRN_B) + '"></i></div>' +
          '<span class="' + NS + '-rs">' + esc(s.region + ' · ' + s.tier + ' · ' +
          (o.rev ? pct(o.gp / o.rev) : '—') + ' GM') + '</span></div>' +
          '<div class="' + NS + '-rv">' + esc(S.metric === 'gm' ? (o.rev ? pct(o.gp / o.rev, 2) : '—') : dollars(v)) + '</div>' +
          '<div class="' + NS + '-rd" style="color:' + (vr >= 0 ? GRN : RED) + '">' + esc(signed(vr)) + '</div>';
        rows.appendChild(row);
      });
    } else {
      hd.innerHTML = '<span>#</span><span>Product</span><span>' +
        esc(METRICS.products.filter(function (m) { return m[0] === S.metric; })[0][1]) +
        '</span><span>margin</span>';
      rows.appendChild(hd);

      var prod = byProduct(focusSet());
      var keys = Object.keys(prod);
      var pvalOf = function (k) {
        var o = prod[k];
        return S.metric === 'op' ? o.gp : S.metric === 'gm' ? o.un : o.rev;
      };
      keys.sort(function (a, b) { return pvalOf(b) - pvalOf(a); });
      var pmx = keys.length ? pvalOf(keys[0]) || 1 : 1;

      if (!keys.length) rows.appendChild(el('div', NS + '-empty', 'No products match the current filters.'));

      keys.slice(0, 40).forEach(function (k, i) {
        var p = d.prodBy[k], o = prod[k];
        if (!p) return;
        var v = pvalOf(k);
        var row = el('div', NS + '-row');
        row.innerHTML =
          '<span class="' + NS + '-rk">' + (i + 1) + '</span>' +
          '<div class="' + NS + '-rm"><div class="' + NS + '-rt"><i style="background:' +
          (CAT_COLOR[p.cat] || GRN_B) + '"></i><b>' + esc(p.name) + '</b></div>' +
          '<div class="' + NS + '-bar"><i style="width:' + Math.round(v / pmx * 100) +
          '%;background:' + (CAT_COLOR[p.cat] || GRN_B) + '"></i></div>' +
          '<span class="' + NS + '-rs">' + esc(p.cat + ' · ' + p.sku) + '</span></div>' +
          '<div class="' + NS + '-rv">' + esc(S.metric === 'gm' ? thou(v) : dollars(v)) + '</div>' +
          '<div class="' + NS + '-rd" style="color:' + MUTE + '">' +
          esc(o.rev ? pct(o.gp / o.rev) : '—') + '</div>';
        rows.appendChild(row);
      });
    }
    panel.appendChild(rows);
    return panel;
  }

  function buildDetail(s, o) {
    var n = el('div', NS + '-detail');
    var h = el('div', NS + '-dh');
    var left = el('div');
    left.appendChild(el('h3', null, esc(s.name)));
    left.appendChild(el('p', null, esc(s.code + ' · ' + s.city + ', ' + s.st + ' · ' +
      s.region + ' · ' + thou(s.sqft) + ' sq ft')));
    h.appendChild(left);
    var cb = el('button', null, 'Clear');
    cb.type = 'button'; cb.setAttribute('data-close', '1');
    h.appendChild(cb);
    n.appendChild(h);

    var vr = (o.op || 0) - (o.bo || 0);
    var g = el('div', NS + '-dg');
    [['Revenue', dollars(o.rev), INK],
     ['Op profit', dollars(o.op), INK],
     ['vs budget', signed(vr), vr >= 0 ? GRN : RED],
     ['Rev / sq ft', s.sqft ? '$' + thou(Math.round((o.rev || 0) / 100 / s.sqft)) : '—', INK]
    ].forEach(function (p) {
      var c = el('div');
      c.appendChild(el('span', null, esc(p[0])));
      var v = el('span', null, esc(p[1]));
      v.style.color = p[2];
      c.appendChild(v);
      g.appendChild(c);
    });
    n.appendChild(g);
    return n;
  }

  /* -------------------------------------------------------------------------
   * 14. RENDER
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
    var scrollTop = V.rows ? V.rows.scrollTop : 0;
    V = {};
    root.className = NS;
    root.removeAttribute('style');
    root.innerHTML = '';

    var raw = window.__tpHome;
    if (!raw || !raw.dim || !raw.dim.s || !raw.dim.s.length) {
      root.appendChild(el('div', NS + '-fail',
        '<div><b>No data in scope.</b><p>window.__tpHome carried no stores. Either the measure ' +
        'returned blank, or the current filters exclude every store.</p></div>'));
      return;
    }
    if (!D || D.__raw !== raw) {
      D = decode(raw); D.__raw = raw;
      /* A filter that no longer exists must not survive new data. */
      S.regions = S.regions.filter(function (r) { return D.regions.indexOf(r) >= 0; });
      S.cats = S.cats.filter(function (c) { return D.cats.indexOf(c) >= 0; });
      if (S.store != null && !D.storeBy[S.store]) S.store = null;
    }

    var tots = byStore();
    var agg = aggregate(focusSet());

    var stage = el('div', NS + '-stage');
    stage.appendChild(buildHeader(D));
    stage.appendChild(buildFilterBar(D));
    stage.appendChild(buildKpis(D, agg));

    var main = el('div', NS + '-main');
    var left = el('div', NS + '-col');
    left.appendChild(buildMap(D, tots));
    left.appendChild(buildTrend(D, agg));
    main.appendChild(left);
    main.appendChild(buildBoard(D, tots));
    stage.appendChild(main);

    var pad = el('div');
    pad.style.cssText = 'flex:0 0 auto;height:14px';
    stage.appendChild(pad);
    root.appendChild(stage);
    root.appendChild(el('div', NS + '-build', 'trailpeak-home v' + VERSION + ' · ' + (D.meta.build || 'dev')));

    V.root = root; V.stage = stage;
    V.rows = root.querySelector('.' + NS + '-rows');
    if (V.rows) V.rows.scrollTop = scrollTop;
    fitStage();

    if (root.__tphWired !== VERSION) { wire(root); root.__tphWired = VERSION; }
  }

  /* -------------------------------------------------------------------------
   * 15. INTERACTION
   * ---------------------------------------------------------------------- */
  function closest(n, sel) {
    while (n && n !== document) {
      if (n.nodeType === 1 && n.matches && n.matches(sel)) return n;
      n = n.parentNode;
    }
    return null;
  }
  function toggle(arr, v) {
    var i = arr.indexOf(v);
    if (i < 0) arr.push(v); else arr.splice(i, 1);
    return arr;
  }

  function wire(root) {
    root.addEventListener('click', function (e) {
      var t;
      if ((t = closest(e.target, '[data-region]'))) {
        toggle(S.regions, t.getAttribute('data-region'));
        /* A selected store outside the new scope is no longer a valid focus. */
        if (S.store != null && D.storeBy[S.store] && !inScope(D.storeBy[S.store])) S.store = null;
        return render();
      }
      if ((t = closest(e.target, '[data-cat]'))) { toggle(S.cats, t.getAttribute('data-cat')); return render(); }
      if ((t = closest(e.target, '[data-mode]'))) {
        S.mode = t.getAttribute('data-mode');
        if (!METRICS[S.mode].some(function (m) { return m[0] === S.metric; })) S.metric = 'rev';
        return render();
      }
      if ((t = closest(e.target, '[data-metric]'))) { S.metric = t.getAttribute('data-metric'); return render(); }
      if (closest(e.target, '[data-close]')) { S.store = null; return render(); }
      if (closest(e.target, '[data-reset]')) { S.regions = []; S.cats = []; S.store = null; return render(); }
      if ((t = closest(e.target, '[data-store]'))) {
        var k = +t.getAttribute('data-store');
        S.store = (S.store === k) ? null : k;
        return render();
      }
    });

    root.addEventListener('change', function (e) {
      var t = closest(e.target, '[data-storesel]');
      if (!t) return;
      S.store = t.value ? +t.value : null;
      render();
    });

    root.addEventListener('mouseover', function (e) {
      var t = closest(e.target, '[data-store]');
      var k = t ? +t.getAttribute('data-store') : null;
      if (k === S.hover) return;
      S.hover = k;
      repaintFocus();
    });
    root.addEventListener('mouseleave', function () {
      if (S.hover == null) return;
      S.hover = null;
      repaintFocus();
    });

    root.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        var t = closest(e.target, '[data-store]');
        if (t) { e.preventDefault(); t.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
      }
      if (e.key === 'Escape' && (S.store != null || S.regions.length || S.cats.length)) {
        S.regions = []; S.cats = []; S.store = null; render();
      }
    });

    if (typeof ResizeObserver === 'function') new ResizeObserver(fitStage).observe(root);
    else window.addEventListener('resize', fitStage);
  }

  /* Hover changes emphasis only. Repainting attributes in place is far cheaper
     than a rebuild and it stops the row list scrolling back to the top every
     time the pointer crosses a bubble. */
  function repaintFocus() {
    if (!D || !V.root) return;
    var focus = S.hover || S.store;
    var nodes = V.root.querySelectorAll('.' + NS + '-node');
    for (var i = 0; i < nodes.length; i++) {
      var g = nodes[i], k = +g.getAttribute('data-store'), s = D.storeBy[k];
      if (!s) continue;
      var sc = inScope(s);
      g.setAttribute('opacity', (!sc || (focus != null && focus !== k)) ? 0.24 : 1);
    }
    var rows = V.root.querySelectorAll('.' + NS + '-row[data-store]');
    for (var j = 0; j < rows.length; j++) {
      rows[j].classList.toggle('on', focus === +rows[j].getAttribute('data-store'));
    }
  }

  /* -------------------------------------------------------------------------
   * 16. BOOT
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
