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
 * v4 = v2's layout, v3's data engine, and a palette that belongs to the P&L page.
 *
 * v2 was the design people liked and it could not filter, because it shipped
 * pre-aggregated totals: one row per store, one per month. There was no grain
 * left to re-sum, so a region click could only dim things.
 * v3 fixed the filtering by shipping grain, and in the process replaced the
 * design, which was not what was asked for. This is the correct combination:
 * the v2 layout is reproduced as-is, the v3 payload and aggregation engine sit
 * underneath it, and only the colours move.
 *
 * WHY THE GEOMETRY IS BAKED
 * ---------------------------------------------------------------------------
 * The design prototype fetched d3 v7 (~280KB), topojson-client and
 * world-atlas countries-110m.json, then projected at runtime. Inside a Power BI
 * visual that is three requests from a null-origin iframe on a tenant that may
 * block any of them. Projection is a pure function of fixed inputs, so it moved
 * to build time: ~10KB of SVG path data replacing ~400KB of library and atlas.
 *
 * Typography is the system stack. The prototype used JetBrains Mono and Space
 * Grotesk, which cost 94KB inlined as base64 to import a look. Cascadia Mono
 * carries the same monospaced character for numerals and ships with Windows,
 * and Segoe UI is what Power BI renders prose in, so the page reads as part of
 * the same report rather than a visitor.
 *
 * WHY IT SHIPS GRAIN
 * ---------------------------------------------------------------------------
 * A native visual filters because the engine re-queries at grain. This one
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
 *    native Power BI buttons over the gap the header leaves, not markup here.
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

  var VERSION = '4.0.0';
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
   * 3. PALETTE
   * The dark canvas and the glow are unchanged. Only the accents move, from a
   * neon mint / cyan / violet / amber set to the report's green family, so the
   * two pages read as one product. Behind-budget is red rather than amber
   * because that is how the P&L page already colours an adverse variance, and
   * a shared semantic is worth more than a shared hue.
   * ---------------------------------------------------------------------- */
  var GRN    = '#2ea56a',   /* primary, ahead of budget          */
      GRN_HI = '#4fd39a',   /* bright accent: live pill, active   */
      GRN_PL = '#8fd6b0',   /* secondary line                     */
      BAD    = '#e05561',   /* behind budget, adverse variance    */
      TEAL   = '#38a8a8',
      OLIVE  = '#8fb96a',
      GOLD   = '#c9a13e',
      INK    = '#e6edf2',
      MUTE   = '#8aa0ad',
      DIM    = '#6f8391',
      FAINT  = '#4d5e69';

  var REGION_COLOR = { Mountain: GRN, Pacific: TEAL, Midwest: OLIVE, Southwest: GOLD };
  var CAT_COLOR = {
    'Camping & Hiking': GRN, 'Climbing': OLIVE, 'Accessories': TEAL,
    'Winter Sports': GRN_PL, 'Apparel': GOLD, 'Footwear': '#b87f5a'
  };

  var SANS = "'Segoe UI','Segoe UI Web (West European)',system-ui,-apple-system,Roboto,Arial,sans-serif";
  var MONO = "ui-monospace,'Cascadia Mono','Cascadia Code',Consolas,'Courier New',monospace";

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

  /* The header leaves this gap. Native Power BI page-navigation buttons are
     positioned over it in the PBIR definition, because a custom visual has no
     handle on IVisualHost and cannot navigate pages itself. */
  var NAV_SLOT_W = 560;

  /* The baked projection fills its 1000x620 box edge to edge, but the store
     labels sit OUTSIDE the bubbles and Sacramento's runs off the left. Pad the
     viewBox rather than re-projecting: same geometry, more room around it. */
  var MAP_PAD = 76;
  var MAP_VIEWBOX = (function () {
    var v = US_VIEWBOX.split(' ');
    return (+v[0] - MAP_PAD) + ' ' + (+v[1] - 14) + ' ' +
           (+v[2] + MAP_PAD * 2) + ' ' + (+v[3] + 28);
  })();

  /* -------------------------------------------------------------------------
   * 4. STYLES  (v2 geometry, verbatim; only colours differ)
   * ---------------------------------------------------------------------- */
  var CSS = [
    '.tph{position:absolute;inset:0;overflow:hidden;background:#06090c;font-family:' + SANS + ';',
    '  color:' + INK + ';-webkit-font-smoothing:antialiased;contain:strict}',
    '.tph *,.tph *::before,.tph *::after{box-sizing:border-box}',
    '.tph-stage{position:absolute;top:0;left:0;width:1920px;height:1080px;transform-origin:0 0;',
    '  background:radial-gradient(1200px 700px at 52% 34%,#0b1a14 0%,#06090c 68%);',
    '  display:flex;flex-direction:column;overflow:hidden}',

    '@keyframes tphRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}',
    '@keyframes tphFade{from{opacity:0}to{opacity:1}}',
    '@keyframes tphPulse{0%,100%{opacity:.35}50%{opacity:1}}',

    /* ---- header ---- */
    '.tph-top{flex:0 0 auto;display:flex;align-items:center;padding:22px 32px 16px;gap:20px;',
    '  animation:tphFade .5s ease both}',
    '.tph-brand{display:flex;align-items:center;gap:14px}',
    '.tph-mark{width:30px;height:30px;border:1.5px solid ' + GRN_HI + ';border-radius:8px;',
    '  transform:rotate(45deg);display:flex;align-items:center;justify-content:center;flex:0 0 auto}',
    '.tph-mark i{width:9px;height:9px;background:' + GRN_HI + ';border-radius:2px;font-style:normal}',
    '.tph-bt h1{margin:0;font-size:19px;font-weight:700;letter-spacing:-.01em;line-height:1.2}',
    '.tph-bt p{margin:3px 0 0;font-family:' + MONO + ';font-size:10px;letter-spacing:.22em;color:' + FAINT + '}',
    '.tph-navgap{flex:0 0 auto}',
    '.tph-spacer{flex:1 1 auto}',
    '.tph-live{display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;',
    '  border:1px solid rgba(79,211,154,.28);background:rgba(79,211,154,.06);flex:0 0 auto}',
    '.tph-live i{width:6px;height:6px;border-radius:999px;background:' + GRN_HI + ';font-style:normal;',
    '  animation:tphPulse 2.4s ease-in-out infinite}',
    '.tph-live span{font-family:' + MONO + ';font-size:10px;letter-spacing:.18em;color:' + GRN_HI + '}',
    '.tph-thru{font-family:' + MONO + ';font-size:11px;color:' + FAINT + ';letter-spacing:.06em;flex:0 0 auto}',
    '.tph-thru b{color:' + INK + ';font-weight:400}',

    /* ---- main grid ---- */
    '.tph-main{flex:1 1 auto;display:grid;grid-template-columns:296px 1fr 404px;gap:18px;',
    '  padding:0 32px;min-height:0}',
    '.tph-main>*{min-height:0}',
    '.tph-card{background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.008));',
    '  border:1px solid rgba(255,255,255,.07);border-radius:16px;display:flex;flex-direction:column;',
    '  min-height:0;overflow:hidden;animation:tphFade .7s ease both}',

    /* ---- KPI rail ---- */
    '.tph-kpis{display:flex;flex-direction:column;gap:12px;min-height:0}',
    '.tph-kpi{flex:1 1 0;background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.012));',
    '  border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:16px 18px 12px;display:flex;',
    '  flex-direction:column;justify-content:space-between;position:relative;overflow:hidden;',
    '  animation:tphRise .55s ease both}',
    '.tph-kt{display:flex;align-items:baseline;justify-content:space-between;gap:8px}',
    '.tph-kt span:first-child{font-family:' + MONO + ';font-size:9.5px;letter-spacing:.2em;color:' + DIM + '}',
    '.tph-kt span:last-child{font-family:' + MONO + ';font-size:10px;white-space:nowrap}',
    '.tph-kb{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;margin-top:8px}',
    '.tph-kv{font-family:' + MONO + ';font-size:32px;font-weight:600;letter-spacing:-.02em;line-height:1;',
    '  font-variant-numeric:tabular-nums}',
    '.tph-ks{font-size:11px;color:' + FAINT + ';margin-top:8px}',

    /* ---- map ---- */
    '.tph-maph{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;padding:14px 18px 10px;gap:12px}',
    '.tph-mapt{display:flex;align-items:center;gap:10px;min-width:0}',
    '.tph-mapt b{font-family:' + MONO + ';font-size:10px;letter-spacing:.2em;color:' + DIM + ';font-weight:400}',
    '.tph-mapt span{font-size:11px;color:' + FAINT + ';white-space:nowrap}',
    '.tph-chips{display:flex;gap:6px;flex:0 0 auto}',
    '.tph-chip{cursor:pointer;font-family:' + MONO + ';font-size:10px;letter-spacing:.1em;padding:6px 11px;',
    '  border-radius:999px;transition:all .18s ease;background:rgba(255,255,255,.03);',
    '  border:1px solid rgba(255,255,255,.09);color:#7d8f9c}',
    '.tph-chip:hover{border-color:rgba(255,255,255,.3);color:' + INK + '}',
    '.tph-chip.on{background:rgba(46,165,106,.16);border-color:rgba(79,211,154,.45);color:' + GRN_HI + '}',
    '.tph-mapw{flex:1 1 auto;min-height:0;position:relative}',
    '.tph-mapw svg{position:absolute;inset:0;width:100%;height:100%;display:block}',
    '.tph-node{cursor:pointer;transition:opacity .18s ease}',
    '.tph-legend{flex:0 0 auto;display:flex;align-items:center;gap:22px;padding:0 18px 14px;',
    '  font-family:' + MONO + ';font-size:9.5px;letter-spacing:.12em;color:' + FAINT + '}',
    '.tph-legend span{display:flex;align-items:center;gap:7px}',
    '.tph-legend i{width:8px;height:8px;border-radius:999px;font-style:normal}',
    '.tph-legend .r{margin-left:auto}',

    /* ---- leaderboard ---- */
    '.tph-lbh{flex:0 0 auto;padding:14px 16px 10px;display:flex;align-items:center;',
    '  justify-content:space-between;gap:10px}',
    '.tph-lbh>b{font-family:' + MONO + ';font-size:10px;letter-spacing:.2em;color:' + DIM + ';font-weight:400}',
    '.tph-seg{display:flex;background:rgba(255,255,255,.04);border-radius:999px;padding:3px}',
    '.tph-seg button{cursor:pointer;border:none;font-family:' + MONO + ';font-size:10px;letter-spacing:.12em;',
    '  padding:6px 14px;border-radius:999px;transition:all .2s ease;background:transparent;color:' + DIM + '}',
    '.tph-seg button.on{background:rgba(46,165,106,.18);color:' + GRN_HI + '}',
    '.tph-mtabs{flex:0 0 auto;display:flex;gap:6px;padding:0 16px 8px}',
    '.tph-mtabs button{cursor:pointer;flex:1 1 0;font-family:' + MONO + ';font-size:9.5px;letter-spacing:.1em;',
    '  padding:7px 0;border-radius:8px;transition:all .18s ease;background:transparent;',
    '  border:1px solid rgba(255,255,255,.08);color:' + DIM + '}',
    '.tph-mtabs button.on{background:rgba(46,165,106,.16);border-color:rgba(79,211,154,.4);color:' + GRN_HI + '}',

    '.tph-detail{flex:0 0 auto;margin:0 16px 12px;padding:14px;border-radius:12px;',
    '  background:rgba(46,165,106,.07);border:1px solid rgba(79,211,154,.22);animation:tphRise .35s ease both}',
    '.tph-dh{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}',
    '.tph-dh h3{margin:0;font-size:16px;font-weight:700}',
    '.tph-dh p{margin:3px 0 0;font-family:' + MONO + ';font-size:10px;color:' + DIM + '}',
    '.tph-dh button{cursor:pointer;background:transparent;border:1px solid rgba(255,255,255,.14);',
    '  color:#7d8f9c;border-radius:8px;font-family:' + MONO + ';font-size:10px;padding:5px 9px;flex:0 0 auto}',
    '.tph-dh button:hover{color:' + INK + ';border-color:rgba(255,255,255,.3)}',
    '.tph-dg{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}',
    '.tph-dg div{display:flex;flex-direction:column;gap:5px}',
    '.tph-dg span:first-child{font-family:' + MONO + ';font-size:8.5px;letter-spacing:.14em;color:' + DIM + '}',
    '.tph-dg span:last-child{font-family:' + MONO + ';font-size:15px}',

    '.tph-rows{flex:1 1 auto;min-height:0;overflow:auto;scrollbar-width:none;padding:0 16px 12px}',
    '.tph-rows::-webkit-scrollbar{width:0;height:0}',
    '.tph-row{display:grid;grid-template-columns:26px 1fr auto;align-items:center;gap:10px;',
    '  padding:4px 8px;border-radius:10px;cursor:pointer;background:transparent;',
    '  transition:background .16s ease,opacity .16s ease}',
    '.tph-row:hover{background:rgba(255,255,255,.04)}',
    '.tph-row.on{background:rgba(255,255,255,.055)}',
    '.tph-row.off{opacity:.28}',
    '.tph-rk{font-family:' + MONO + ';font-size:10.5px;color:#3d4b55}',
    '.tph-row.on .tph-rk{color:' + GRN_HI + '}',
    '.tph-rm{min-width:0;display:flex;flex-direction:column;gap:2px}',
    '.tph-rt{display:flex;align-items:center;gap:7px}',
    '.tph-rt i{width:6px;height:6px;border-radius:999px;flex:0 0 auto;font-style:normal}',
    '.tph-rt b{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.tph-bar{height:3px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden}',
    '.tph-bar i{display:block;height:100%;border-radius:999px;font-style:normal;',
    '  transition:width .5s cubic-bezier(.22,1,.36,1)}',
    '.tph-rs{font-family:' + MONO + ';font-size:9.5px;color:' + FAINT + ';letter-spacing:.06em;',
    '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.tph-rv{text-align:right;display:flex;flex-direction:column;gap:4px}',
    '.tph-rv span:first-child{font-family:' + MONO + ';font-size:14px;font-variant-numeric:tabular-nums}',
    '.tph-rv span:last-child{font-family:' + MONO + ';font-size:10px;font-variant-numeric:tabular-nums}',
    '.tph-empty{padding:22px 16px;font-size:12px;color:' + FAINT + ';text-align:center}',

    /* ---- trend ---- */
    '.tph-rib{flex:0 0 auto;margin:18px 32px 24px;height:150px;',
    '  background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.008));',
    '  border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:12px 20px 8px;',
    '  display:flex;flex-direction:column;animation:tphFade .8s ease both}',
    '.tph-ribh{flex:0 0 auto;display:flex;align-items:baseline;gap:14px}',
    '.tph-ribh h3{margin:0;font-family:' + MONO + ';font-size:10px;letter-spacing:.16em;',
    '  text-transform:uppercase;color:' + DIM + ';font-weight:400}',
    '.tph-lg{display:flex;gap:14px;margin-left:auto;font-family:' + MONO + ';font-size:10px;color:' + DIM + '}',
    '.tph-lg span{display:flex;align-items:center;gap:6px}',
    '.tph-lg i{width:14px;height:2.5px;border-radius:2px;font-style:normal}',
    '.tph-ribsvg{flex:1 1 auto;min-height:0;margin-top:4px}',
    '.tph-ribsvg svg{display:block;width:100%;height:100%}',

    /* ---- tooltip ---- */
    '.tph-tip{position:absolute;pointer-events:none;opacity:0;transition:opacity .14s ease;z-index:9;',
    '  background:rgba(8,14,19,.94);border:1px solid rgba(255,255,255,.12);border-radius:10px;',
    '  padding:9px 11px;font:400 11px/1.5 ' + MONO + ';color:' + INK + ';white-space:nowrap;',
    '  box-shadow:0 12px 34px rgba(0,0,0,.6);transform:translate(-50%,-115%)}',
    '.tph-tip.on{opacity:1}',
    '.tph-tipn{font:700 12px/1.3 ' + SANS + '}',
    '.tph-tips{color:#7d8f9c;font-size:10px;margin:2px 0 7px}',
    '.tph-tipg{display:grid;grid-template-columns:auto auto;gap:2px 18px}',
    '.tph-tipg span:nth-child(odd){color:#7d8f9c}',
    '.tph-tipg span:nth-child(even){text-align:right}',

    '.tph-build{position:absolute;right:14px;bottom:8px;font-family:' + MONO + ';font-size:9px;',
    '  color:#22303a;letter-spacing:.08em;pointer-events:none}',
    '.tph-fail{position:absolute;inset:0;display:grid;place-items:center;background:#06090c;padding:40px;',
    '  text-align:center}',
    '.tph-fail b{display:block;font-size:17px;color:' + BAD + ';margin-bottom:10px}',
    '.tph-fail p{margin:0;font-size:13px;line-height:1.65;color:#8aa0ad;max-width:620px}',
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
  function pct(x, dp) { return !isNum(x) ? '—' : (x * 100).toFixed(dp == null ? 2 : dp) + '%'; }
  function thou(n) { return !isNum(n) ? '—' : Math.round(n).toLocaleString('en-US'); }

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
   * ---------------------------------------------------------------------- */
  var S = window.__tphState;
  if (!S || S.v !== VERSION) {
    S = window.__tphState = { v: VERSION, regions: [], store: null, mode: 'stores', metric: 'rev', hover: null };
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
    (raw.dim && raw.dim.p || []).forEach(function (p) { d.products.push({ k: p[0], sku: p[1], name: p[2], cat: p[3] }); });

    d.storeBy = {}; d.stores.forEach(function (s) { d.storeBy[s.k] = s; });
    d.monthIx = {}; d.months.forEach(function (m, i) { d.monthIx[m.k] = i; });
    d.prodBy = {}; d.products.forEach(function (p) { d.prodBy[p.k] = p; });

    /* Fixed order, not discovery order. The chips are a fixed piece of chrome
       and must not reshuffle because the payload happened to list stores in a
       different sequence. Anything unrecognised is appended alphabetically. */
    var PREF = ['Mountain', 'Pacific', 'Midwest', 'Southwest'];
    var seen = [];
    d.stores.forEach(function (s) { if (seen.indexOf(s.region) < 0) seen.push(s.region); });
    d.regions = PREF.filter(function (r) { return seen.indexOf(r) >= 0; })
      .concat(seen.filter(function (r) { return PREF.indexOf(r) < 0; }).sort());
    return d;
  }

  /* -------------------------------------------------------------------------
   * 8. THE FILTER MODEL
   *
   * Two levels, deliberately, because that is how a native page behaves:
   *
   *   SCOPE  the region chips. A slicer. Everything obeys it, including the
   *          store league table and the map.
   *   FOCUS  a selected store. A cross-filter. The KPI rail, the trend and the
   *          product table re-scope to it, while the league table and map keep
   *          every in-scope store visible and merely highlight it, which is
   *          what a native bar chart does when you click one of its bars.
   * ---------------------------------------------------------------------- */
  function inScope(s) { return !S.regions.length || S.regions.indexOf(s.region) >= 0; }
  function scopeStores() { return D.stores.filter(inScope); }
  function focusSet() {
    var out = {};
    if (S.store != null && D.storeBy[S.store] && inScope(D.storeBy[S.store])) out[S.store] = 1;
    else scopeStores().forEach(function (s) { out[s.k] = 1; });
    return out;
  }

  /* Sum store x month over a store set. One linear pass, no per-row allocation. */
  function aggregate(sset) {
    var f = D.f, nM = D.months.length;
    var tot = { rev: 0, gp: 0, eb: 0, op: 0, br: 0, bo: 0, un: 0 };
    var byM = [];
    for (var i = 0; i < nM; i++) byM.push({ rev: 0, gp: 0, op: 0, bo: 0 });
    for (var j = 0; j < f.length; j += 9) {
      if (!sset[f[j]]) continue;
      var mi = D.monthIx[f[j + 1]];
      var rev = f[j + 2] || 0, gp = f[j + 3] || 0, eb = f[j + 4] || 0,
          op = f[j + 5] || 0, br = f[j + 6] || 0, bo = f[j + 7] || 0, un = f[j + 8] || 0;
      tot.rev += rev; tot.gp += gp; tot.eb += eb; tot.op += op;
      tot.br += br; tot.bo += bo; tot.un += un;
      if (mi != null) { var m = byM[mi]; m.rev += rev; m.gp += gp; m.op += op; m.bo += bo; }
    }
    return { tot: tot, byM: byM };
  }

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

  /* Product totals over a store set. This is what makes the product league
     table follow the region chips instead of ignoring them. */
  function byProduct(sset) {
    var x = D.x, out = {};
    for (var j = 0; j < x.length; j += 5) {
      if (!sset[x[j + 1]]) continue;
      var o = out[x[j]] || (out[x[j]] = { rev: 0, un: 0, gp: 0 });
      o.rev += x[j + 2] || 0; o.un += x[j + 3] || 0; o.gp += x[j + 4] || 0;
    }
    return out;
  }

  /* Trailing twelve months against the twelve before. The prototype hardcoded
     these; there is monthly grain in the payload, so compute them, and return
     null rather than inventing a number when history is short. */
  function yoy(byM, pick) {
    if (!byM || byM.length < 24) return null;
    var n = byM.length, cur = 0, prv = 0;
    for (var i = n - 12; i < n; i++) cur += pick(byM[i]) || 0;
    for (var j = n - 24; j < n - 12; j++) prv += pick(byM[j]) || 0;
    if (!prv) return null;
    return (cur - prv) / Math.abs(prv);
  }
  function yoyBp(byM, num, den) {
    if (!byM || byM.length < 24) return null;
    var n = byM.length, cn = 0, cd = 0, pn = 0, pd = 0;
    for (var i = n - 12; i < n; i++) { cn += num(byM[i]) || 0; cd += den(byM[i]) || 0; }
    for (var j = n - 24; j < n - 12; j++) { pn += num(byM[j]) || 0; pd += den(byM[j]) || 0; }
    if (!cd || !pd) return null;
    return (cn / cd - pn / pd) * 10000;
  }

  /* -------------------------------------------------------------------------
   * 9. HEADER
   * ---------------------------------------------------------------------- */
  function buildTop(d) {
    var n = el('div', NS + '-top');
    var b = el('div', NS + '-brand');
    b.appendChild(el('div', NS + '-mark', '<i></i>'));
    var bt = el('div', NS + '-bt');
    bt.appendChild(el('h1', null, 'TrailPeak Outfitters'));
    bt.appendChild(el('p', null, 'FINANCE · MONTHLY REPORTING'));
    b.appendChild(bt);
    n.appendChild(b);

    /* Deliberately empty: native page-navigation buttons sit over this gap. */
    var gap = el('div', NS + '-navgap');
    gap.style.width = NAV_SLOT_W + 'px';
    gap.setAttribute('aria-hidden', 'true');
    n.appendChild(gap);

    n.appendChild(el('div', NS + '-spacer'));
    n.appendChild(el('div', NS + '-live', '<i></i><span>MODEL LIVE</span>'));
    var thru = String(d.meta.through || '').replace(/^Data through\s*/i, '').toUpperCase();
    n.appendChild(el('div', NS + '-thru', 'DATA THROUGH <b>' + esc(thru) + '</b>'));
    return n;
  }

  /* -------------------------------------------------------------------------
   * 10. KPI RAIL
   * ---------------------------------------------------------------------- */
  function buildKpis(d, agg) {
    var wrap = el('div', NS + '-kpis');
    var t = agg.tot, m = agg.byM;
    var revs = m.map(function (r) { return r.rev; });
    var ops = m.map(function (r) { return r.op; });
    var gms = m.map(function (r) { return r.rev ? r.gp / r.rev * 100 : 0; });

    /* D&A is not in the payload at monthly grain, so EBITDA per month is
       reconstructed by spreading the period gap evenly. An approximation, and
       flagged as one rather than presented as measured. */
    var dna = m.length ? (t.eb - t.op) / m.length : 0;
    var ebs = ops.map(function (v) { return v + dna; });

    function pctD(v) {
      if (v == null) return { t: '—', c: FAINT };
      return { t: (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '% YoY', c: v >= 0 ? GRN_HI : BAD };
    }
    var gmB = yoyBp(m, function (r) { return r.gp; }, function (r) { return r.rev; });
    var opVar = t.op - t.bo;

    var items = [
      { l: 'TOTAL REVENUE', v: money(t.rev), vals: revs, stroke: GRN_HI, fill: 'rgba(79,211,154,.16)',
        d: pctD(yoy(m, function (r) { return r.rev; })),
        s: d.months.length + ' closed months · ' + (t.un / 1e6).toFixed(2) + 'M units' },
      { l: 'GROSS MARGIN', v: pct(t.rev ? t.gp / t.rev : null), vals: gms, stroke: TEAL, fill: 'rgba(56,168,168,.14)',
        d: gmB == null ? { t: '—', c: FAINT }
          : { t: (gmB >= 0 ? '+' : '') + Math.round(gmB) + 'bp YoY', c: gmB >= 0 ? GRN_HI : BAD },
        s: 'Gross profit ' + money(t.gp) },
      { l: 'EBITDA', v: money(t.eb), vals: ebs, stroke: GRN, fill: 'rgba(46,165,106,.14)',
        d: pctD(yoy(m, function (r) { return r.op; })),
        s: pct(t.rev ? t.eb / t.rev : null) + ' of revenue' },
      /* This card compares to BUDGET, not to last year. It has a plan to be
         measured against and its sub-line already talks about budget; mixing
         the two references on one card is how a wrong number gets quoted. */
      { l: 'OPERATING PROFIT', v: money(t.op), vals: ops, stroke: opVar >= 0 ? GRN : GOLD,
        fill: opVar >= 0 ? 'rgba(46,165,106,.14)' : 'rgba(201,161,62,.14)',
        d: { t: (opVar >= 0 ? '▲ ' : '▼ ') + money(Math.abs(opVar), 1) + ' vs budget', c: opVar >= 0 ? GRN_HI : BAD },
        s: pct(t.rev ? t.op / t.rev : null) + ' margin' }
    ];

    items.forEach(function (it, i) {
      var c = el('div', NS + '-kpi');
      c.style.animationDelay = (i * 0.06) + 's';
      var top = el('div', NS + '-kt');
      top.appendChild(el('span', null, esc(it.l)));
      var ds = el('span', null, esc(it.d.t));
      ds.style.color = it.d.c;
      top.appendChild(ds);
      c.appendChild(top);

      var mid = el('div', NS + '-kb');
      mid.appendChild(el('div', NS + '-kv', esc(it.v)));
      if (it.vals.length > 1) {
        mid.appendChild(el('div', null,
          '<svg width="96" height="34" viewBox="0 0 96 34" style="display:block;opacity:.95">' +
          '<path d="' + areaPath(it.vals, 96, 34, 4) + '" fill="' + it.fill + '"></path>' +
          '<path d="' + linePath(it.vals, 96, 34, 4) + '" fill="none" stroke="' + it.stroke +
          '" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"></path></svg>'));
      }
      c.appendChild(mid);
      c.appendChild(el('div', NS + '-ks', esc(it.s)));
      wrap.appendChild(c);
    });
    return wrap;
  }

  /* -------------------------------------------------------------------------
   * 11. MAP
   * ---------------------------------------------------------------------- */
  function mval(o, metric) {
    if (metric === 'op') return Math.max(0, o.op || 0);
    if (metric === 'gm') return o.rev ? o.gp / o.rev * 1e6 : 0;
    return o.rev || 0;
  }

  function buildMap(d, tots) {
    var panel = el('div', NS + '-card');
    var head = el('div', NS + '-maph');
    var t = el('div', NS + '-mapt');
    var scope = scopeStores();
    t.appendChild(el('b', null, 'STORE NETWORK'));
    t.appendChild(el('span', null, scope.length + ' stores · ' +
      (S.regions.length || d.regions.length) + ' regions · bubble = ' +
      (S.metric === 'op' ? 'op profit' : S.metric === 'gm' ? 'margin' : 'revenue')));
    head.appendChild(t);

    var chips = el('div', NS + '-chips');
    var all = el('button', NS + '-chip' + (S.regions.length ? '' : ' on'), 'ALL');
    all.type = 'button'; all.setAttribute('data-region', '*');
    chips.appendChild(all);
    d.regions.forEach(function (r) {
      var b = el('button', NS + '-chip' + (S.regions.indexOf(r) >= 0 ? ' on' : ''), esc(r.toUpperCase()));
      b.type = 'button';
      b.setAttribute('data-region', r);
      b.setAttribute('aria-pressed', S.regions.indexOf(r) >= 0 ? 'true' : 'false');
      chips.appendChild(b);
    });
    head.appendChild(chips);
    panel.appendChild(head);

    var wrap = el('div', NS + '-mapw');
    var gid = NS + 'g' + (++uid), cid = NS + 'c' + uid;
    var mx = 1;
    scope.forEach(function (s) { mx = Math.max(mx, mval(tots[s.k] || {}, S.metric)); });
    var focus = S.hover || S.store;

    var nodes = '';
    d.stores.forEach(function (s, i) {
      if (s.x == null) return;
      var sc = inScope(s), o = tots[s.k] || { rev: 0, op: 0, bo: 0 };
      var rad = sc ? Math.max(6, Math.sqrt(mval(o, S.metric) / mx) * 34) : 5;
      var col = (o.op - o.bo) >= 0 ? GRN : BAD;
      var isF = focus === s.k;
      var dim = !sc || (focus != null && !isF);
      var lx = s.dx + (s.anchor === 'end' ? -rad : s.anchor === 'middle' ? 0 : rad);
      var ly = s.dy + (s.anchor === 'middle' ? (s.dy < 0 ? -rad + 4 : rad - 2) : 4);

      nodes +=
        '<g class="' + NS + '-node" data-store="' + s.k + '" transform="translate(' + s.x + ',' + s.y + ')" ' +
        'opacity="' + (dim ? 0.22 : 1) + '" tabindex="0" role="button" aria-label="' +
        esc(s.name + ', ' + money(o.rev)) + '" style="animation:tphFade .5s ease both;animation-delay:' +
        (0.05 * i + 0.1).toFixed(2) + 's">' +
        (sc ? '<circle r="' + (rad * 2.3).toFixed(1) + '" fill="url(#' + gid + ')"></circle>' : '') +
        '<circle class="halo" r="' + (isF ? rad + 12 : rad).toFixed(1) + '" fill="none" stroke="' + col +
        '" stroke-width="1" opacity="' + (isF ? 0.9 : 0) + '"></circle>' +
        '<circle class="disc" r="' + rad.toFixed(1) + '" fill="' + col + '" fill-opacity="' +
        (isF ? 0.5 : (s.tier === 'Flagship' ? 0.26 : 0.16)) + '" stroke="' + col +
        '" stroke-opacity="0.75" stroke-width="' + (s.tier === 'Flagship' ? 1.6 : 1) + '"></circle>' +
        '<circle r="' + Math.max(2, rad * 0.16).toFixed(1) + '" fill="' + col + '"></circle>' +
        '<circle r="' + Math.max(rad, 16).toFixed(1) + '" fill="transparent"></circle>' +
        '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="' + s.anchor +
        '" font-family="' + MONO.replace(/"/g, "'") + '" font-size="10" letter-spacing=".06em" fill="' +
        (isF ? INK : MUTE) + '">' + esc(s.city.toUpperCase()) + '</text>' +
        '<text class="val" x="' + lx.toFixed(1) + '" y="' + (ly + 12).toFixed(1) + '" text-anchor="' + s.anchor +
        '" font-family="' + MONO.replace(/"/g, "'") + '" font-size="10" fill="' + col +
        '" opacity="' + (isF ? 1 : 0) + '">' + esc(money(o.rev)) + '</text>' +
        '</g>';
    });

    wrap.innerHTML =
      '<svg viewBox="' + MAP_VIEWBOX + '" preserveAspectRatio="xMidYMid meet" role="img" ' +
      'aria-label="Map of the United States with store locations sized by the selected measure">' +
      '<defs><radialGradient id="' + gid + '">' +
      '<stop offset="0%" stop-color="rgba(46,165,106,.30)"></stop>' +
      '<stop offset="100%" stop-color="rgba(46,165,106,0)"></stop></radialGradient>' +
      '<clipPath id="' + cid + '"><path d="' + US_LAND + '"></path></clipPath></defs>' +
      '<path d="' + US_LAND + '" fill="#0b1712" stroke="rgba(120,200,160,.30)" stroke-width="1" ' +
      'stroke-linejoin="round"></path>' +
      '<path d="' + US_GRAT + '" fill="none" stroke="rgba(255,255,255,.04)" stroke-width="0.5" ' +
      'clip-path="url(#' + cid + ')"></path>' +
      '<g>' + nodes + '</g></svg>';

    var tip = el('div', NS + '-tip');
    wrap.appendChild(tip);
    V.tip = tip; V.mapw = wrap;
    panel.appendChild(wrap);

    var lg = el('div', NS + '-legend');
    lg.innerHTML =
      '<span><i style="background:rgba(46,165,106,.35);border:1px solid ' + GRN + '"></i>AHEAD OF BUDGET</span>' +
      '<span><i style="background:rgba(224,85,97,.35);border:1px solid ' + BAD + '"></i>BEHIND BUDGET</span>' +
      '<span class="r">CLICK A STORE TO DRILL IN</span>';
    panel.appendChild(lg);
    return panel;
  }

  function paintTip(tots) {
    if (!V.tip || !D || !V.mapw) return;
    var focus = S.hover || S.store, s = D.storeBy[focus];
    if (!s || s.x == null || !inScope(s)) { V.tip.classList.remove('on'); return; }
    var o = (tots || byStore())[s.k] || { rev: 0, op: 0, bo: 0 };

    /* preserveAspectRatio means viewBox units are not panel pixels. Recover the
       real transform rather than assuming the box fills the panel. */
    var r = V.mapw.getBoundingClientRect(), vb = MAP_VIEWBOX.split(' ');
    var vw = +vb[2], vh = +vb[3], k = Math.min(r.width / vw, r.height / vh);
    var ox = (r.width - vw * k) / 2 - (+vb[0]) * k, oy = (r.height - vh * k) / 2 - (+vb[1]) * k;
    var mx = 1;
    scopeStores().forEach(function (q) { mx = Math.max(mx, mval((tots || {})[q.k] || {}, S.metric)); });
    var rad = Math.max(6, Math.sqrt(mval(o, S.metric) / mx) * 34);
    var vr = (o.op || 0) - (o.bo || 0);

    V.tip.innerHTML =
      '<div class="' + NS + '-tipn">' + esc(s.name) + '</div>' +
      '<div class="' + NS + '-tips">' + esc(s.code + ' · ' + s.city + ', ' + s.st + ' · ' + s.tier) + '</div>' +
      '<div class="' + NS + '-tipg">' +
      '<span>Revenue</span><span>' + esc(money(o.rev)) + '</span>' +
      '<span>Op profit</span><span>' + esc(money(o.op)) + '</span>' +
      '<span>vs budget</span><span style="color:' + (vr >= 0 ? GRN_HI : BAD) + '">' +
      (vr >= 0 ? '▲ ' : '▼ ') + esc(money(Math.abs(vr))) + '</span></div>';
    V.tip.style.left = (ox + s.x * k) + 'px';
    V.tip.style.top = (oy + (s.y - rad) * k - 6) + 'px';
    V.tip.classList.add('on');
  }

  /* -------------------------------------------------------------------------
   * 12. LEADERBOARD
   * ---------------------------------------------------------------------- */
  var METRICS = {
    stores: [['rev', 'REVENUE'], ['op', 'OP PROFIT'], ['gm', 'MARGIN']],
    products: [['rev', 'REVENUE'], ['op', 'GROSS PROFIT'], ['gm', 'UNITS']]
  };

  function buildBoard(d, tots) {
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

    if (S.mode === 'stores' && S.store != null && d.storeBy[S.store]) {
      panel.appendChild(buildDetail(d.storeBy[S.store], tots[S.store] || {}));
    }

    var rows = el('div', NS + '-rows');
    var focus = S.hover || S.store;

    if (S.mode === 'stores') {
      var scope = scopeStores();
      var valOf = function (s) {
        var o = tots[s.k] || {};
        return S.metric === 'op' ? (o.op || 0) : S.metric === 'gm' ? (o.rev ? o.gp / o.rev : 0) : (o.rev || 0);
      };
      var list = scope.slice().sort(function (a, b) { return valOf(b) - valOf(a); });
      var mx = Math.max.apply(null, list.map(function (s) { return Math.abs(valOf(s)); })) || 1;
      if (!list.length) rows.appendChild(el('div', NS + '-empty', 'No stores match the current filters.'));

      list.forEach(function (s, i) {
        var o = tots[s.k] || { rev: 0, op: 0, bo: 0, gp: 0 };
        var isF = focus === s.k, dimmed = S.store != null && S.store !== s.k;
        var vr = (o.op || 0) - (o.bo || 0);
        var row = el('div', NS + '-row' + (isF ? ' on' : '') + (dimmed ? ' off' : ''));
        row.setAttribute('data-store', s.k);
        row.setAttribute('tabindex', '0');
        row.innerHTML =
          '<span class="' + NS + '-rk">' + String(i + 1).padStart(2, '0') + '</span>' +
          '<div class="' + NS + '-rm"><div class="' + NS + '-rt"><i style="background:' +
          (REGION_COLOR[s.region] || GRN) + '"></i><b>' + esc(s.name) + '</b></div>' +
          '<div class="' + NS + '-bar"><i style="width:' + Math.round(Math.abs(valOf(s)) / mx * 100) +
          '%;background:' + (REGION_COLOR[s.region] || GRN) + '"></i></div>' +
          '<span class="' + NS + '-rs">' + esc(s.city + ', ' + s.st + ' · ' + s.tier.toUpperCase() +
          ' · ' + (o.rev ? pct(o.gp / o.rev) : '—') + ' GM') + '</span></div>' +
          '<div class="' + NS + '-rv"><span>' +
          esc(S.metric === 'gm' ? (o.rev ? pct(o.gp / o.rev) : '—') : money(valOf(s))) +
          '</span><span style="color:' + (vr >= 0 ? GRN_HI : BAD) + '">' +
          (vr >= 0 ? '▲ ' : '▼ ') + esc(money(Math.abs(vr))) + '</span></div>';
        rows.appendChild(row);
      });
    } else {
      var prod = byProduct(focusSet());
      var keys = Object.keys(prod);
      var pv = function (k) {
        var o = prod[k];
        return S.metric === 'op' ? o.gp : S.metric === 'gm' ? o.un : o.rev;
      };
      keys.sort(function (a, b) { return pv(b) - pv(a); });
      var pmx = keys.length ? (pv(keys[0]) || 1) : 1;
      if (!keys.length) rows.appendChild(el('div', NS + '-empty', 'No products match the current filters.'));

      keys.slice(0, 40).forEach(function (k, i) {
        var p = d.prodBy[k], o = prod[k];
        if (!p) return;
        var row = el('div', NS + '-row');
        row.innerHTML =
          '<span class="' + NS + '-rk">' + String(i + 1).padStart(2, '0') + '</span>' +
          '<div class="' + NS + '-rm"><div class="' + NS + '-rt"><i style="background:' +
          (CAT_COLOR[p.cat] || GRN) + '"></i><b>' + esc(p.name) + '</b></div>' +
          '<div class="' + NS + '-bar"><i style="width:' + Math.round(pv(k) / pmx * 100) +
          '%;background:' + (CAT_COLOR[p.cat] || GRN) + '"></i></div>' +
          '<span class="' + NS + '-rs">' + esc(p.cat.toUpperCase() + ' · ' + p.sku) + '</span></div>' +
          '<div class="' + NS + '-rv"><span>' +
          esc(S.metric === 'gm' ? thou(pv(k)) + ' u' : money(pv(k))) +
          '</span><span style="color:' + DIM + '">' + esc(o.rev ? pct(o.gp / o.rev, 1) + ' GM' : '—') +
          '</span></div>';
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
      s.region.toUpperCase() + ' · ' + thou(s.sqft) + ' SQFT')));
    h.appendChild(left);
    var cb = el('button', null, 'CLOSE');
    cb.type = 'button'; cb.setAttribute('data-close', '1');
    h.appendChild(cb);
    n.appendChild(h);

    var vr = (o.op || 0) - (o.bo || 0);
    var g = el('div', NS + '-dg');
    [['REVENUE', money(o.rev), INK],
     ['OP PROFIT', money(o.op), INK],
     ['VS BUDGET', (vr >= 0 ? '+' : '−') + money(Math.abs(vr)), vr >= 0 ? GRN_HI : BAD],
     ['REV / SQFT', s.sqft ? '$' + thou(Math.round((o.rev || 0) / 100 / s.sqft)) : '—', INK]
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
   * 13. TREND
   * ---------------------------------------------------------------------- */
  function buildTrend(d, agg) {
    var n = el('div', NS + '-rib');
    var head = el('div', NS + '-ribh');
    head.appendChild(el('h3', null, 'MONTHLY REVENUE AND OPERATING PROFIT · ' + d.months.length + ' CLOSED MONTHS'));
    head.appendChild(el('div', NS + '-lg',
      '<span><i style="background:' + GRN_HI + '"></i>REVENUE</span>' +
      '<span><i style="background:' + GRN + '"></i>OPERATING PROFIT</span>' +
      '<span><i style="background:#4d5e69"></i>BUDGET</span>'));
    n.appendChild(head);

    var m = agg.byM;
    if (m.length < 2) { n.appendChild(el('div', NS + '-empty', 'Not enough closed months to plot a trend.')); return n; }

    var W = 1816, H = 108, gid = NS + 'r' + (++uid), gid2 = NS + 'o' + uid;
    var revs = m.map(function (r) { return r.rev; });
    var ops = m.map(function (r) { return r.op; });
    var bos = m.map(function (r) { return r.bo; });

    function band(vals, dom, y0, y1) {
      var mn = Math.min.apply(null, dom), mx = Math.max.apply(null, dom), sp = (mx - mn) || 1;
      return vals.map(function (v, i) {
        return { x: 44 + i / (vals.length - 1) * (W - 88), y: y1 - (v - mn) / sp * (y1 - y0) };
      });
    }
    function toPath(ps) {
      return ps.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
    }
    var revPts = band(revs, revs.concat([0]), 4, 50);
    var opDom = ops.concat(bos);
    var opPts = band(ops, opDom, 62, 90);
    var boPts = band(bos, opDom, 62, 90);
    var peakI = revs.indexOf(Math.max.apply(null, revs));

    var ticks = '';
    m.forEach(function (r, i) {
      if (i % 6 !== 0 && i !== m.length - 1) return;
      ticks += '<text x="' + (44 + i / (m.length - 1) * (W - 88)).toFixed(1) + '" y="' + (H - 2) +
        '" fill="#5b6d78" font-family="' + MONO.replace(/"/g, "'") + '" font-size="9" letter-spacing="1" ' +
        'text-anchor="' + (i === 0 ? 'start' : i === m.length - 1 ? 'end' : 'middle') + '">' +
        esc((d.months[i] ? d.months[i].label : '').toUpperCase()) + '</text>';
    });
    var peaks = '';
    [[revPts[peakI], GRN_HI], [revPts[revPts.length - 1], GRN_HI], [opPts[opPts.length - 1], GRN]].forEach(function (p) {
      if (!p[0]) return;
      peaks += '<circle cx="' + p[0].x.toFixed(1) + '" cy="' + p[0].y.toFixed(1) +
        '" r="3" fill="#06090c" stroke="' + p[1] + '" stroke-width="1.6"></circle>';
    });

    var wrap = el('div', NS + '-ribsvg');
    wrap.innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" ' +
      'aria-label="Monthly revenue and operating profit against budget">' +
      /* userSpaceOnUse, not the default objectBoundingBox. These fills are
         ~1730 units wide and ~46 tall inside an SVG that is then stretched
         non-uniformly by preserveAspectRatio="none" and scaled again by the
         stage transform. Under that, a bounding-box gradient rasterises in
         tiles that do not agree, and a hard vertical seam appears partway
         across the band. Anchoring the gradient to user space removes the
         dependency on the box entirely. */
      '<defs><linearGradient id="' + gid + '" gradientUnits="userSpaceOnUse" x1="0" y1="4" x2="0" y2="50">' +
      '<stop offset="0%" stop-color="rgba(79,211,154,.30)"></stop>' +
      '<stop offset="100%" stop-color="rgba(79,211,154,0)"></stop></linearGradient>' +
      '<linearGradient id="' + gid2 + '" gradientUnits="userSpaceOnUse" x1="0" y1="62" x2="0" y2="92">' +
      '<stop offset="0%" stop-color="rgba(46,165,106,.22)"></stop>' +
      '<stop offset="100%" stop-color="rgba(46,165,106,0)"></stop></linearGradient></defs>' +
      '<path d="' + toPath(revPts) + ' L' + (W - 44) + ' 50 L44 50 Z" fill="url(#' + gid + ')"></path>' +
      '<path d="' + toPath(opPts) + ' L' + (W - 44) + ' 92 L44 92 Z" fill="url(#' + gid2 + ')"></path>' +
      '<path d="' + toPath(boPts) + '" fill="none" stroke="#4d5e69" stroke-width="1.2" ' +
      'stroke-dasharray="4 4" vector-effect="non-scaling-stroke"></path>' +
      '<path d="' + toPath(revPts) + '" fill="none" stroke="' + GRN_HI + '" stroke-width="1.8" ' +
      'stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>' +
      '<path d="' + toPath(opPts) + '" fill="none" stroke="' + GRN + '" stroke-width="1.8" ' +
      'stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>' +
      ticks + peaks + '</svg>';
    n.appendChild(wrap);
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
      S.regions = S.regions.filter(function (r) { return D.regions.indexOf(r) >= 0; });
      if (S.store != null && !D.storeBy[S.store]) S.store = null;
    }

    var tots = byStore();
    var agg = aggregate(focusSet());

    var stage = el('div', NS + '-stage');
    stage.appendChild(buildTop(D));
    var main = el('div', NS + '-main');
    main.appendChild(buildKpis(D, agg));
    main.appendChild(buildMap(D, tots));
    main.appendChild(buildBoard(D, tots));
    stage.appendChild(main);
    stage.appendChild(buildTrend(D, agg));
    root.appendChild(stage);
    root.appendChild(el('div', NS + '-build', 'trailpeak-home v' + VERSION + ' · ' + (D.meta.build || 'dev')));

    V.root = root; V.stage = stage; V.tots = tots;
    V.rows = root.querySelector('.' + NS + '-rows');
    if (V.rows) V.rows.scrollTop = scrollTop;
    fitStage();
    paintTip(tots);

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

  function wire(root) {
    root.addEventListener('click', function (e) {
      var t;
      if ((t = closest(e.target, '[data-region]'))) {
        var r = t.getAttribute('data-region');
        /* ALL is the only clear affordance this design has, so it clears the
           store cross-filter too. Strictly a slicer would not, but leaving a
           store selected after the user asked for everything reads as a bug. */
        if (r === '*') { S.regions = []; S.store = null; }
        else {
          var i = S.regions.indexOf(r);
          if (i < 0) S.regions.push(r); else S.regions.splice(i, 1);
        }
        if (S.store != null && D.storeBy[S.store] && !inScope(D.storeBy[S.store])) S.store = null;
        return render();
      }
      if ((t = closest(e.target, '[data-mode]'))) {
        S.mode = t.getAttribute('data-mode');
        if (!METRICS[S.mode].some(function (m) { return m[0] === S.metric; })) S.metric = 'rev';
        return render();
      }
      if ((t = closest(e.target, '[data-metric]'))) { S.metric = t.getAttribute('data-metric'); return render(); }
      if (closest(e.target, '[data-close]')) { S.store = null; return render(); }
      if ((t = closest(e.target, '[data-store]'))) {
        var k = +t.getAttribute('data-store');
        S.store = (S.store === k) ? null : k;
        return render();
      }
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
      if (e.key === 'Escape' && (S.store != null || S.regions.length)) {
        S.store = null; S.regions = []; render();
      }
    });

    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(function () { fitStage(); paintTip(V.tots); }).observe(root);
    } else {
      window.addEventListener('resize', function () { fitStage(); paintTip(V.tots); });
    }
  }

  /* Hover changes emphasis only. Repainting attributes in place is far cheaper
     than a rebuild and it stops the row list scrolling back to the top every
     time the pointer crosses a bubble. */
  function repaintFocus() {
    if (!D || !V.root) return;
    var focus = S.hover || S.store, tots = V.tots || byStore();
    var mx = 1;
    scopeStores().forEach(function (q) { mx = Math.max(mx, mval(tots[q.k] || {}, S.metric)); });

    var nodes = V.root.querySelectorAll('.' + NS + '-node');
    for (var i = 0; i < nodes.length; i++) {
      var g = nodes[i], k = +g.getAttribute('data-store'), s = D.storeBy[k];
      if (!s) continue;
      var sc = inScope(s), isF = focus === k;
      var o = tots[k] || {};
      var rad = sc ? Math.max(6, Math.sqrt(mval(o, S.metric) / mx) * 34) : 5;
      g.setAttribute('opacity', (!sc || (focus != null && !isF)) ? 0.22 : 1);
      var halo = g.querySelector('.halo'), disc = g.querySelector('.disc'), val = g.querySelector('.val');
      if (halo) { halo.setAttribute('r', (isF ? rad + 12 : rad).toFixed(1)); halo.setAttribute('opacity', isF ? 0.9 : 0); }
      if (disc) disc.setAttribute('fill-opacity', isF ? 0.5 : (s.tier === 'Flagship' ? 0.26 : 0.16));
      if (val) val.setAttribute('opacity', isF ? 1 : 0);
      var lbl = g.querySelectorAll('text')[0];
      if (lbl) lbl.setAttribute('fill', isF ? INK : MUTE);
    }
    var rows = V.root.querySelectorAll('.' + NS + '-row[data-store]');
    for (var j = 0; j < rows.length; j++) {
      rows[j].classList.toggle('on', focus === +rows[j].getAttribute('data-store'));
    }
    paintTip(tots);
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
