/*!
 * TrailPeak Outfitters - the ENTIRE report page as one Power BI visual
 * ---------------------------------------------------------------------------
 * Repo    : https://github.com/sulaiman013/dax-with-js
 * Serve   : https://cdn.statically.io/gh/sulaiman013/dax-with-js@trailpeak-page-v1.0.0/trailpeak/trailpeak-page.js
 * License : MIT
 *
 * WHY ONE VISUAL
 * ---------------------------------------------------------------------------
 * A custom visual cannot cross-filter its neighbours unless its own compiled
 * TypeScript builds selection identities and calls selectionManager.select().
 * The HTML Content visual never does; there are zero references to
 * ISelectionId in its source. So injected JavaScript can never filter OUT.
 *
 * The way around that is not to fight it. If the whole page IS the visual,
 * there is nothing to cross-filter TO. The measure ships facts at grain, the
 * browser holds them, and every click re-aggregates in place. Selection becomes
 * a local concern and works everywhere, instantly, with no model round trip.
 *
 * What that costs, stated plainly:
 *   - Power BI's own slicers, bookmarks and drillthrough do not drive this page.
 *     It brings its own controls. Report-level filters DO still apply, because
 *     the measure is evaluated in filter context.
 *   - Export data returns markup, not rows. Same as before.
 *   - The payload is ~1.1M characters, about 53% of the ~2.1M measure ceiling.
 *     That is the real budget to watch, and why the grain below is deliberate.
 *
 * THE DATA CONTRACT - window.__tpPage
 * ---------------------------------------------------------------------------
 * Facts are FLAT numeric arrays with a fixed stride, holding indexes into the
 * dimension lists. Arrays of objects would roughly triple the size for no gain.
 * Money is integer minor units (cents); FORMAT(x,"0") in DAX emits no separator
 * in any locale, so a de-DE workspace cannot corrupt the payload.
 *
 *   dim.accounts [[key, name, category], ...]
 *   dim.stores   [[key, code, name, region, tier], ...]
 *   dim.products [[key, sku, name, category], ...]
 *   dim.months   [[key, label], ...]              chronological
 *   dim.lines    [[key, label, rowType, indent, bold], ...]
 *
 *   bridge  [lineIdx, acctIdx, ...]                        stride 2
 *   pnl     [acctIdx, storeIdx, monthIdx, actual, budget]  stride 5
 *   sales   [prodIdx, storeIdx, monthIdx, rev, units, cost] stride 6
 *
 * The bridge is many-to-many and already carries every rollup: Operating Profit
 * maps to all 20 accounts, Gross Profit to 6. So no subtotal is derived here.
 * A line total is the sum of its mapped accounts, which is exactly what the
 * model's [P&L Line Value] computes with TREATAS. Sign is pre-applied in DAX,
 * so costs arrive negative and a subtotal is a plain sum.
 *
 * WHAT PRODUCT SELECTION CAN AND CANNOT DO
 * ---------------------------------------------------------------------------
 * dim_product has no relationship to the P&L facts, so selecting a product
 * cannot decompose the statement. It genuinely can't: fact_sales carries one
 * Revenue column while the P&L splits revenue into Retail, Online and Services.
 * Rather than silently showing a wrong number, the statement stays at
 * store-and-period scope and says so, and the product's contribution to the
 * revenue and product-cost lines is shown separately. Those two DO reconcile:
 * product cost ties to the Product Cost line to the cent.
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';

  if (window.TPP && window.TPP.__installed === VERSION && typeof window.TPP.boot === 'function') {
    window.TPP.boot();
    return;
  }

  /* =========================================================================
   * STYLES
   * ====================================================================== */
  var CSS = [
    ':root{',
    '--k-ink:#0f172a;--k-mut:#64748b;--k-fnt:#94a3b8;--k-ln:#e2e8f0;--k-ln2:#cbd5e1;',
    '--k-bg:#f6f7f9;--k-sf:#ffffff;--k-sf2:#f8fafc;',
    '--k-ac:#2d6a4f;--k-ac2:#f4faf6;--k-acl:#cde3d6;--k-ac3:#e6f2ea;',
    '--k-pos:#16a34a;--k-neg:#dc2626;--k-amb:#d97706;--k-amb2:#b45309;--k-grid:#eef2f7;',
    '--k-sh:0 1px 2px rgba(15,23,42,.05),0 6px 18px -12px rgba(15,23,42,.18);',
    '}',
    '.tpp *{background-color:transparent;background-image:none;border:0;margin:0;padding:0;',
    'color:inherit;text-align:inherit;text-transform:none;letter-spacing:normal;list-style:none;',
    'text-decoration:none;box-shadow:none;float:none;text-indent:0;vertical-align:baseline;}',
    '.tpp *,.tpp *::before,.tpp *::after{box-sizing:border-box;}',
    'html,body{margin:0;padding:0;height:100%;background:transparent;}',
    'body{overflow:hidden;}',
    ".tpp{height:100%;font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Arial,sans-serif;",
    'font-size:13px;line-height:1.45;color:var(--k-ink);font-variant-numeric:tabular-nums;',
    '-webkit-font-smoothing:antialiased;}',
    '.tpp button,.tpp select,.tpp input{font:inherit;color:inherit;}',
    '.tpp :focus-visible{outline:2px solid var(--k-ac);outline-offset:2px;border-radius:4px;}',

    '.k-page{display:flex;flex-direction:column;height:100vh;max-height:100%;overflow:hidden;',
    'background:var(--k-bg);gap:8px;padding:8px;}',

    /* header */
    '.k-hd{flex:0 0 auto;display:flex;align-items:center;gap:14px;padding:11px 16px;border-radius:10px;',
    'background:linear-gradient(100deg,#14432f 0%,#2d6a4f 62%,#357a5b 100%);color:#fff;}',
    '.k-hd-t{font-size:16px;font-weight:700;letter-spacing:-.01em;}',
    '.k-hd-s{font-size:11px;opacity:.78;letter-spacing:.05em;text-transform:uppercase;}',
    '.k-hd-sp{flex:1 1 auto;}',
    '.k-hd-r{text-align:right;font-size:11px;opacity:.85;}',
    '.k-hd-r b{display:block;font-size:13px;opacity:1;font-weight:650;}',

    /* filter bar. Two EXPLICIT rows rather than flex-wrap: at 1280 the content
       always wrapped, and with margin-left:auto on Reset that pushed the button
       to the end of whichever row it landed on, which read as a bug. */
    '.k-fb{flex:0 0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 12px;',
    'background:var(--k-sf);border:1px solid var(--k-ln);border-radius:10px;box-shadow:var(--k-sh);}',
    /* Summary + Reset travel together in one trailing group. Previously Reset
       carried margin-left:auto on its own, so when the bar wrapped it landed at
       the end of whichever row it happened to fall on, which read as a bug. */
    '.k-fend{display:flex;align-items:center;gap:9px;margin-left:auto;}',
    '.k-lab{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;',
    'color:var(--k-fnt);margin-right:1px;}',
    '.k-sep{width:1px;height:18px;background:var(--k-ln);margin:0 4px;}',
    '.k-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;',
    'border:1px solid var(--k-ln);background:var(--k-sf);color:var(--k-mut);font-size:11.5px;',
    'font-weight:600;cursor:pointer;white-space:nowrap;transition:background .12s,color .12s,border-color .12s;}',
    '.k-chip:hover{border-color:var(--k-ln2);color:var(--k-ink);}',
    '.k-chip[aria-pressed="true"]{background:var(--k-ac);border-color:var(--k-ac);color:#fff;}',
    '.k-sel{padding:4px 8px;border:1px solid var(--k-ln);border-radius:7px;background:var(--k-sf);',
    'color:var(--k-ink);font-size:11.5px;font-weight:600;cursor:pointer;max-width:150px;}',
    '.k-reset{margin-left:auto;display:inline-flex;align-items:center;gap:5px;padding:4px 11px;',
    'border-radius:999px;border:1px solid var(--k-ln);background:var(--k-sf);color:var(--k-mut);',
    'font-size:11.5px;font-weight:600;cursor:pointer;}',
    '.k-reset:hover{border-color:var(--k-neg);color:var(--k-neg);}',
    '.k-reset[disabled]{opacity:.4;cursor:default;}',
    '.k-pill{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;',
    'font-size:11.5px;font-weight:600;color:var(--k-ac);background:var(--k-ac2);border:1px solid var(--k-acl);}',
    '.k-pill button{border:0;background:none;color:inherit;cursor:pointer;font-weight:700;opacity:.6;padding:0 0 0 2px;}',
    '.k-pill button:hover{opacity:1;}',

    /* kpi strip */
    '.k-kpis{flex:0 0 auto;display:grid;grid-template-columns:repeat(6,1fr);gap:8px;}',
    '.k-kpi{background:var(--k-sf);border:1px solid var(--k-ln);border-radius:10px;padding:9px 12px;',
    'box-shadow:var(--k-sh);position:relative;overflow:hidden;}',
    '.k-kpi::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--k-ac);}',
    '.k-kpi.is-neg::before{background:var(--k-neg);}',
    '.k-kpi.is-amb::before{background:var(--k-amb);}',
    '.k-kpi-l{font-size:9.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;',
    'color:var(--k-fnt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.k-kpi-v{font-size:19px;font-weight:700;letter-spacing:-.02em;line-height:1.2;margin-top:2px;}',
    '.k-kpi-d{font-size:10.5px;font-weight:600;margin-top:1px;}',

    /* grid */
    '.k-grid{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:8px;}',
    '.k-col{display:flex;flex-direction:column;gap:8px;min-height:0;min-width:0;}',
    /* Cards FILL their column. Without this they size to content and leave a
       dead band at the bottom of the page, which is exactly what happened at
       the real 1280x1200 visual size. */
    '.k-card{background:var(--k-sf);border:1px solid var(--k-ln);border-radius:10px;',
    'box-shadow:var(--k-sh);display:flex;flex-direction:column;min-height:0;overflow:hidden;',
    'flex:1 1 auto;}',
    '.k-card.is-fixed{flex:0 0 auto;}',
    '.k-card-hd{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:9px 13px;',
    'border-bottom:1px solid var(--k-ln);}',
    '.k-card-t{font-size:12.5px;font-weight:650;}',
    '.k-card-n{font-size:10.5px;color:var(--k-fnt);}',
    '.k-card-sp{flex:1 1 auto;}',
    '.k-card-bd{flex:1 1 auto;min-height:0;overflow:auto;}',
    '.k-card-bd::-webkit-scrollbar{width:8px;height:8px;}',
    '.k-card-bd::-webkit-scrollbar-thumb{background:var(--k-ln2);border-radius:99px;border:2px solid var(--k-sf);}',
    '.k-note{font-size:10.5px;color:var(--k-amb2);background:#fffbeb;border:1px solid #fde68a;',
    'border-radius:6px;padding:3px 8px;font-weight:600;}',

    /* tables */
    '.k-tbl{width:100%;border-collapse:collapse;font-size:12px;}',
    '.k-tbl th{position:sticky;top:0;z-index:2;background:var(--k-sf);padding:6px 10px;',
    'font-size:9.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--k-mut);',
    'font-weight:700;border-bottom:1.5px solid var(--k-ink);white-space:nowrap;text-align:right;}',
    '.k-tbl th:first-child{text-align:left;}',
    '.k-tbl td{padding:4.5px 10px;text-align:right;white-space:nowrap;}',
    '.k-tbl td:first-child{text-align:left;white-space:normal;}',
    '.k-tbl tbody tr:hover td{background:var(--k-sf2);}',
    '.k-r-sub>td{border-top:1px solid var(--k-ln2);font-weight:650;}',
    '.k-r-tot>td{border-top:1.5px solid var(--k-ink);background:var(--k-ac2);font-weight:700;}',
    '.k-r-tot:hover>td{background:var(--k-ac3);}',
    '.k-pos{color:var(--k-pos);}.k-neg{color:var(--k-neg);}.k-nil{color:var(--k-fnt);}',
    '.k-mut{color:var(--k-mut);}',
    '.k-row-click{cursor:pointer;}',
    '.k-row-click.is-on>td{background:var(--k-ac2);}',
    '.k-vb{display:block;width:100%;height:3px;margin-top:2px;background:var(--k-ln);border-radius:2px;position:relative;}',
    '.k-vb span{position:absolute;top:0;height:100%;border-radius:2px;}',

    /* chart */
    '.k-chart{flex:1 1 auto;min-height:0;position:relative;padding:6px 10px 2px;}',
    '.k-chart svg{display:block;width:100%;height:100%;overflow:visible;}',
    '.k-bar{cursor:pointer;transition:opacity .12s;}',
    '.k-bar-g:hover .k-bar{opacity:.75;}',
    '.k-bar-g.is-dim .k-bar{opacity:.22;}',
    '.k-bar-g.is-on .k-bar{opacity:1;}',
    '.k-tip{position:absolute;z-index:9;pointer-events:none;opacity:0;transform:translate(-50%,-100%);',
    'padding:7px 10px;border-radius:7px;background:var(--k-ink);color:#fff;font-size:11.5px;',
    'line-height:1.5;box-shadow:0 8px 22px -8px rgba(0,0,0,.5);white-space:nowrap;transition:opacity .1s;}',
    '.k-tip.is-on{opacity:1;}',
    '.k-lg{flex:0 0 auto;display:flex;flex-wrap:wrap;gap:5px 14px;padding:6px 13px 9px;',
    'font-size:10.5px;color:var(--k-fnt);}',
    '.k-key{display:inline-flex;align-items:center;gap:5px;}',
    '.k-sw{width:8px;height:8px;border-radius:2px;}',

    '.k-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;',
    'height:100%;gap:4px;color:var(--k-mut);padding:20px;text-align:center;}',
    '.k-empty b{font-size:13px;color:var(--k-ink);}',
    '.k-empty span{font-size:11.5px;color:var(--k-fnt);}',

    '@media (max-width:1000px){.k-grid{grid-template-columns:1fr;}.k-kpis{grid-template-columns:repeat(3,1fr);}}',
    '@media (max-width:620px){.k-kpis{grid-template-columns:repeat(2,1fr);}}'
  ].join('');

  /* =========================================================================
   * STATE + UTILITIES
   * ====================================================================== */
  var MINUS = String.fromCharCode(0x2212), DOT = String.fromCharCode(0xB7);

  var S = window.__tppState || (window.__tppState = {
    m0: null, m1: null,          // month index range, null = full
    regions: {}, stores: {}, cats: {},   // name/idx -> true
    product: null,               // product index
    line: null,                  // statement line index, for the trend
    measure: 'revenue',
    topN: 0
  });

  var V = {};   // per-render handles
  var D = null; // decoded data

  function el(t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function keys(o) { var a = []; for (var k in o) if (o[k]) a.push(k); return a; }
  function anyKey(o) { for (var k in o) if (o[k]) return true; return false; }

  function makeFmt(locale, currency) {
    function nf(o) { try { return new Intl.NumberFormat(locale || 'en-US', o); } catch (e) { return null; } }
    var w = nf({ maximumFractionDigits: 0 });
    var m0 = nf({ style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 });
    var p1 = nf({ style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
    var p0 = nf({ style: 'percent', maximumFractionDigits: 0 });
    function grp(n) { return Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    return {
      /* accounting style, matching the original "#,##0;(#,##0)" format strings */
      acct: function (v) { if (!isNum(v)) return null; var s = w ? w.format(Math.abs(v)) : grp(v); return v < 0 ? '(' + s + ')' : s; },
      num: function (v) { return isNum(v) ? (w ? w.format(v) : grp(v)) : null; },
      money: function (v) { return isNum(v) ? (m0 ? m0.format(v) : '$' + grp(v)).replace(/^-/, MINUS) : null; },
      signed: function (v) { if (!isNum(v)) return null; if (v === 0) return '0'; var s = w ? w.format(Math.abs(v)) : grp(v); return v > 0 ? '+' + s : '(' + s + ')'; },
      pct: function (v, dp) { if (!isNum(v)) return null; var f = dp === 0 ? p0 : p1; return f ? f.format(v) : (v * 100).toFixed(dp === 0 ? 0 : 1) + '%'; },
      spct: function (v) { if (!isNum(v)) return null; var s = p1 ? p1.format(Math.abs(v)) : (Math.abs(v) * 100).toFixed(1) + '%'; return v === 0 ? s : (v > 0 ? '+' + s : '(' + s + ')'); },
      cmp: function (v) {
        if (!isNum(v)) return null;
        var a = Math.abs(v), g = v < 0 ? MINUS : '';
        if (a >= 1e9) return g + (a / 1e9).toFixed(1) + 'B';
        if (a >= 1e6) return g + (a / 1e6).toFixed(1) + 'M';
        if (a >= 1e3) return g + Math.round(a / 1e3) + 'K';
        return g + Math.round(a);
      }
    };
  }

  var NICE = [1, 1.2, 1.4, 1.5, 1.6, 1.8, 2, 2.4, 2.5, 3, 3.2, 4, 5, 6, 8, 10];
  function niceCeil(v) {
    if (!isNum(v) || v <= 0) return 1;
    var mag = Math.pow(10, Math.floor(Math.log(v) / Math.LN10)), n = v / mag;
    for (var i = 0; i < NICE.length; i++) if (n <= NICE[i] + 1e-9) return NICE[i] * mag;
    return 10 * mag;
  }
  function clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + String.fromCharCode(0x2026) : s; }

  /* =========================================================================
   * DECODE
   * ====================================================================== */
  function decode(raw) {
    var d = {
      meta: raw.meta || {},
      accounts: raw.dim.accounts, stores: raw.dim.stores,
      products: raw.dim.products, months: raw.dim.months, lines: raw.dim.lines,
      pnl: raw.pnl || [], sales: raw.sales || [], bridge: raw.bridge || []
    };
    d.nA = d.accounts.length; d.nS = d.stores.length;
    d.nP = d.products.length; d.nM = d.months.length; d.nL = d.lines.length;

    /* The facts arrive keyed by the model's own business keys, because emitting
       a dense 0..n-1 index from DAX would mean a RANKX or LOOKUPVALUE per fact
       row, and there are 40k of them. Translating here is one linear pass. */
    var i, map = function (rows) {
      var m = {};
      for (var j = 0; j < rows.length; j++) m[rows[j][0]] = j;
      return m;
    };
    var mA = map(d.accounts), mS = map(d.stores), mP = map(d.products),
        mM = map(d.months), mL = map(d.lines);

    function reindex(arr, stride, maps) {
      for (var j = 0; j < arr.length; j += stride) {
        for (var c = 0; c < maps.length; c++) {
          var v = maps[c][arr[j + c]];
          arr[j + c] = v === undefined ? -1 : v;
        }
      }
    }
    if (!raw.__reindexed) {
      reindex(d.bridge, 2, [mL, mA]);
      reindex(d.pnl, 5, [mA, mS, mM]);
      reindex(d.sales, 6, [mP, mS, mM]);
      raw.__reindexed = true;
    }

    /* line -> account index list, from the many-to-many bridge */
    d.lineAccts = [];
    for (i = 0; i < d.nL; i++) d.lineAccts.push([]);
    for (i = 0; i < d.bridge.length; i += 2) {
      if (d.bridge[i] >= 0 && d.bridge[i + 1] >= 0) d.lineAccts[d.bridge[i]].push(d.bridge[i + 1]);
    }

    d.regions = []; d.storesByRegion = {};
    for (i = 0; i < d.nS; i++) {
      var r = d.stores[i][3];
      if (d.regions.indexOf(r) === -1) { d.regions.push(r); d.storesByRegion[r] = []; }
      d.storesByRegion[r].push(i);
    }
    d.regions.sort();
    d.cats = [];
    for (i = 0; i < d.nP; i++) if (d.cats.indexOf(d.products[i][3]) === -1) d.cats.push(d.products[i][3]);
    d.cats.sort();
    return d;
  }

  /* =========================================================================
   * AGGREGATION
   * Typed masks and one linear pass per cube. 40k sales rows is sub-millisecond,
   * which is why every control can recompute the whole page on each click.
   * ====================================================================== */
  function buildMasks() {
    var i, mMask = new Uint8Array(D.nM), sMask = new Uint8Array(D.nS), pMask = new Uint8Array(D.nP);

    var m0 = S.m0 == null ? 0 : S.m0, m1 = S.m1 == null ? D.nM - 1 : S.m1;
    if (m0 > m1) { var t = m0; m0 = m1; m1 = t; }
    for (i = m0; i <= m1; i++) mMask[i] = 1;

    var regSel = anyKey(S.regions), stSel = anyKey(S.stores);
    for (i = 0; i < D.nS; i++) {
      var okR = !regSel || !!S.regions[D.stores[i][3]];
      var okS = !stSel || !!S.stores[i];
      sMask[i] = (okR && okS) ? 1 : 0;
    }
    var catSel = anyKey(S.cats);
    for (i = 0; i < D.nP; i++) {
      var okC = !catSel || !!S.cats[D.products[i][3]];
      pMask[i] = okC ? 1 : 0;
    }
    return { m: mMask, s: sMask, p: pMask, m0: m0, m1: m1 };
  }

  function aggregate(mask) {
    var i, a = D.pnl, s = D.sales;

    /* P&L: store + month only. Product has no relationship to these facts. */
    var act = new Float64Array(D.nA), bud = new Float64Array(D.nA);
    for (i = 0; i < a.length; i += 5) {
      if (mask.s[a[i + 1]] && mask.m[a[i + 2]]) { act[a[i]] += a[i + 3]; bud[a[i]] += a[i + 4]; }
    }

    /* Sales: store + month + category. Product selection is applied later, so
       the Pareto keeps its full context and only dims the unselected bars. */
    var rev = new Float64Array(D.nP), uni = new Float64Array(D.nP), cst = new Float64Array(D.nP);
    var revByStore = new Float64Array(D.nS), revByMonth = new Float64Array(D.nM);
    var selRev = 0, selUni = 0, selCst = 0;
    for (i = 0; i < s.length; i += 6) {
      var pi = s[i], si = s[i + 1], mi = s[i + 2];
      if (!mask.s[si] || !mask.m[mi] || !mask.p[pi]) continue;
      var r = s[i + 3], u = s[i + 4], c = s[i + 5];
      rev[pi] += r; uni[pi] += u; cst[pi] += c;
      revByStore[si] += r; revByMonth[mi] += r;
      if (S.product === pi) { selRev += r; selUni += u; selCst += c; }
    }

    /* Statement lines from the bridge. A line is the sum of its accounts; sign
       was applied in DAX so this is a plain sum, subtotals included. */
    var lines = [];
    for (i = 0; i < D.nL; i++) {
      var accts = D.lineAccts[i], va = 0, vb = 0, hasA = false, hasB = false;
      for (var j = 0; j < accts.length; j++) {
        va += act[accts[j]]; vb += bud[accts[j]];
        if (act[accts[j]] !== 0) hasA = true;
        if (bud[accts[j]] !== 0) hasB = true;
      }
      var A = hasA ? va / 100 : (accts.length ? 0 : null);
      var B = hasB ? vb / 100 : null;
      lines.push({
        idx: i, key: D.lines[i][0], label: D.lines[i][1], rowType: D.lines[i][2],
        indent: D.lines[i][3], bold: !!D.lines[i][4],
        a: A, b: B,
        v: (isNum(A) && isNum(B)) ? A - B : null,
        vp: (isNum(A) && isNum(B) && B !== 0) ? (A - B) / Math.abs(B) : null
      });
    }

    return {
      lines: lines, act: act, bud: bud,
      rev: rev, uni: uni, cst: cst,
      revByStore: revByStore, revByMonth: revByMonth,
      sel: { rev: selRev / 100, uni: selUni, cst: selCst / 100 }
    };
  }

  function lineByLabel(lines, label) {
    for (var i = 0; i < lines.length; i++) if (lines[i].label === label) return lines[i];
    return null;
  }

  /* =========================================================================
   * RENDER
   * ====================================================================== */
  function render() {
    var root = ensureRoot();
    ensureStyles();
    V = {};
    root.className = 'tpp';
    root.innerHTML = '';

    var raw = window.__tpPage;
    if (!raw || !raw.dim) {
      root.appendChild(emptyBox('Waiting for data', 'window.__tpPage was not set.'));
      return;
    }
    if (!D || D.__raw !== raw) { D = decode(raw); D.__raw = raw; }

    var fmt = makeFmt(D.meta.locale, D.meta.currency);
    var mask = buildMasks();
    var agg = aggregate(mask);
    V.fmt = fmt; V.mask = mask; V.agg = agg;

    var page = el('div', 'k-page');
    page.appendChild(buildHeader(mask));
    page.appendChild(buildFilterBar(mask));
    page.appendChild(buildKpis(agg, fmt));

    var grid = el('div', 'k-grid');
    var left = el('div', 'k-col'), right = el('div', 'k-col');
    left.appendChild(buildStatement(agg, fmt));
    left.appendChild(buildTrend(fmt));
    right.appendChild(buildPareto(agg, fmt));
    right.appendChild(buildStores(agg, fmt));
    grid.appendChild(left); grid.appendChild(right);
    page.appendChild(grid);

    root.appendChild(page);

    if (root.__tppWired !== VERSION) { wire(root); root.__tppWired = VERSION; }
  }

  function emptyBox(t, s) {
    return el('div', 'k-empty', '<b>' + esc(t) + '</b><span>' + esc(s) + '</span>');
  }

  function buildHeader(mask) {
    var h = el('div', 'k-hd');
    var period = D.months[mask.m0][1] + (mask.m0 === mask.m1 ? '' : ' ' + MINUS + ' ' + D.months[mask.m1][1]);
    h.innerHTML =
      '<div><div class="k-hd-t">' + esc(D.meta.title || 'TrailPeak Outfitters') + '</div>' +
      '<div class="k-hd-s">' + esc(D.meta.company || '') + '</div></div>' +
      '<div class="k-hd-sp"></div>' +
      '<div class="k-hd-r"><b>' + esc(period) + '</b>' + esc(D.meta.dataThrough || '') + '</div>';
    return h;
  }

  function buildFilterBar(mask) {
    var bar = el('div', 'k-fb');
    var r1 = bar, r2 = bar, i;   // one wrapping row; the browser breaks it if it must

    r1.appendChild(el('span', 'k-lab', 'Period'));
    r1.appendChild(monthSelect('k-m0', mask.m0));
    r1.appendChild(el('span', 'k-lab', 'to'));
    r1.appendChild(monthSelect('k-m1', mask.m1));
    r1.appendChild(el('span', 'k-sep'));
    r1.appendChild(el('span', 'k-lab', 'Region'));
    for (i = 0; i < D.regions.length; i++) {
      r1.appendChild(chip(D.regions[i], 'region', D.regions[i], !!S.regions[D.regions[i]]));
    }
    r1.appendChild(el('span', 'k-sep'));
    r1.appendChild(el('span', 'k-lab', 'Store'));
    var sel = el('select', 'k-sel');
    sel.id = 'k-store';
    sel.setAttribute('aria-label', 'Store');
    var opts = '<option value="">All stores</option>';
    for (i = 0; i < D.nS; i++) {
      /* only offer stores inside the chosen regions */
      if (anyKey(S.regions) && !S.regions[D.stores[i][3]]) continue;
      opts += '<option value="' + i + '"' + (S.stores[i] ? ' selected' : '') + '>' +
        esc(D.stores[i][2]) + '</option>';
    }
    sel.innerHTML = opts;
    r1.appendChild(sel);

    r1.appendChild(el('span', 'k-sep'));
    r2.appendChild(el('span', 'k-lab', 'Category'));
    for (i = 0; i < D.cats.length; i++) {
      r2.appendChild(chip(D.cats[i], 'cat', D.cats[i], !!S.cats[D.cats[i]]));
    }
    if (S.product != null) {
      r2.appendChild(el('span', 'k-sep'));
      var p = D.products[S.product];
      var pill = el('span', 'k-pill');
      pill.innerHTML = esc(clip(p[2], 30)) + '<button type="button" data-k="clear-product" ' +
        'aria-label="Clear product selection">' + String.fromCharCode(0xD7) + '</button>';
      r2.appendChild(pill);
    }
    var end = el('div', 'k-fend');
    end.appendChild(el('span', 'k-lab', summarise(mask)));
    var reset = el('button', 'k-reset', 'Reset all');
    reset.type = 'button';
    reset.setAttribute('data-k', 'reset');
    if (!isFiltered()) reset.setAttribute('disabled', 'disabled');
    end.appendChild(reset);
    bar.appendChild(end);
    return bar;
  }

  function summarise(mask) {
    var n = mask.m1 - mask.m0 + 1;
    var st = 0;
    for (var i = 0; i < D.nS; i++) if (mask.s[i]) st++;
    var pr = 0;
    for (i = 0; i < D.nP; i++) if (mask.p[i]) pr++;
    return n + ' month' + (n === 1 ? '' : 's') + ' ' + DOT + ' ' +
      st + ' of ' + D.nS + ' stores ' + DOT + ' ' + pr + ' of ' + D.nP + ' products';
  }

  function isFiltered() {
    return S.m0 != null || S.m1 != null || anyKey(S.regions) || anyKey(S.stores) ||
      anyKey(S.cats) || S.product != null;
  }

  function monthSelect(id, cur) {
    var s = el('select', 'k-sel');
    s.id = id;
    s.setAttribute('aria-label', id === 'k-m0' ? 'Period from' : 'Period to');
    var o = '';
    for (var i = 0; i < D.nM; i++) {
      o += '<option value="' + i + '"' + (i === cur ? ' selected' : '') + '>' + esc(D.months[i][1]) + '</option>';
    }
    s.innerHTML = o;
    return s;
  }

  function chip(label, kind, val, on) {
    var b = el('button', 'k-chip');
    b.type = 'button';
    b.setAttribute('data-k', kind);
    b.setAttribute('data-v', val);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.textContent = label;
    return b;
  }

  /* ---- KPI strip ---------------------------------------------------------- */
  function buildKpis(agg, fmt) {
    var L = agg.lines;
    var rev = lineByLabel(L, 'Total Revenue'), gp = lineByLabel(L, 'Gross Profit');
    var eb = lineByLabel(L, 'EBITDA'), op = lineByLabel(L, 'Operating Profit');

    var totRev = 0, totUni = 0, totCst = 0, i;
    for (i = 0; i < D.nP; i++) { totRev += agg.rev[i]; totUni += agg.uni[i]; totCst += agg.cst[i]; }
    totRev /= 100; totCst /= 100;

    /* vital few under the current selection */
    var idxs = [];
    for (i = 0; i < D.nP; i++) if (agg.rev[i] > 0) idxs.push(i);
    idxs.sort(function (x, y) { return agg.rev[y] - agg.rev[x] || x - y; });
    var run = 0, n80 = 0, tot = 0;
    for (i = 0; i < idxs.length; i++) tot += agg.rev[idxs[i]];
    for (i = 0; i < idxs.length; i++) { run += agg.rev[idxs[i]]; if (run / tot >= 0.8) { n80 = i + 1; break; } }

    var cards = [
      { l: 'Net Revenue', v: fmt.money(rev ? rev.a : null), d: rev && isNum(rev.v) ? fmt.signed(rev.v) + ' vs budget' : null, good: rev && rev.v >= 0 },
      { l: 'Gross Profit', v: fmt.money(gp ? gp.a : null), d: gp && rev && isNum(gp.a) && rev.a ? fmt.pct(gp.a / rev.a) + ' margin' : null, good: true },
      { l: 'EBITDA', v: fmt.money(eb ? eb.a : null), d: eb && isNum(eb.v) ? fmt.signed(eb.v) + ' vs budget' : null, good: eb && eb.v >= 0 },
      { l: 'Operating Profit', v: fmt.money(op ? op.a : null), d: op && rev && isNum(op.a) && rev.a ? fmt.pct(op.a / rev.a) + ' of revenue' : null, good: op && op.a >= 0 },
      { l: 'Units Sold', v: fmt.num(totUni), d: fmt.money(totRev) + ' product revenue', good: true },
      { l: 'Vital Few', v: n80 ? n80 + ' of ' + idxs.length : '-', d: 'SKUs drive 80%', good: true, amb: true }
    ];

    var g = el('div', 'k-kpis');
    for (i = 0; i < cards.length; i++) {
      var c = cards[i];
      var k = el('div', 'k-kpi' + (c.amb ? ' is-amb' : (c.good === false ? ' is-neg' : '')));
      k.innerHTML = '<div class="k-kpi-l">' + esc(c.l) + '</div>' +
        '<div class="k-kpi-v">' + esc(c.v == null ? '-' : c.v) + '</div>' +
        (c.d ? '<div class="k-kpi-d ' + (c.good === false ? 'k-neg' : 'k-mut') + '">' + esc(c.d) + '</div>' : '');
      g.appendChild(k);
    }
    return g;
  }

  /* ---- P&L statement ------------------------------------------------------ */
  function buildStatement(agg, fmt) {
    var card = el('div', 'k-card');
    var hd = el('div', 'k-card-hd');
    hd.innerHTML = '<span class="k-card-t">Profit &amp; Loss</span>' +
      '<span class="k-card-n">Actual vs Budget</span><span class="k-card-sp"></span>' +
      (S.product != null || anyKey(S.cats)
        ? '<span class="k-note">product filters do not apply</span>' : '');
    card.appendChild(hd);

    var bd = el('div', 'k-card-bd');
    var maxV = 0, i;
    for (i = 0; i < agg.lines.length; i++) if (isNum(agg.lines[i].v)) maxV = Math.max(maxV, Math.abs(agg.lines[i].v));

    var h = '<table class="k-tbl"><thead><tr><th>Line</th><th>Actual</th><th>Budget</th>' +
      '<th>Var</th><th>Var %</th></tr></thead><tbody>';
    for (i = 0; i < agg.lines.length; i++) {
      var r = agg.lines[i];
      var cls = 'k-row-click' + (r.rowType === 'Total' ? ' k-r-tot' : (r.rowType === 'Subtotal' ? ' k-r-sub' : '')) +
        (S.line === i ? ' is-on' : '');
      var tone = !isNum(r.v) ? 'k-nil' : (r.v >= 0 ? 'k-pos' : 'k-neg');
      var bar = '';
      if (isNum(r.v) && maxV) {
        var f = Math.min(1, Math.abs(r.v) / maxV) * 50;
        bar = '<span class="k-vb"><span style="left:' + (r.v >= 0 ? 50 : 50 - f).toFixed(2) +
          '%;width:' + f.toFixed(2) + '%;background:' + (r.v >= 0 ? 'var(--k-pos)' : 'var(--k-neg)') + '"></span></span>';
      }
      h += '<tr class="' + cls + '" data-k="line" data-v="' + i + '">' +
        '<td style="padding-left:' + (10 + r.indent * 14) + 'px;font-weight:' + (r.bold ? '650' : '400') + '">' + esc(r.label) + '</td>' +
        '<td style="font-weight:' + (r.bold ? '650' : '400') + '">' + esc(fmt.acct(r.a) || '-') + '</td>' +
        '<td class="k-mut">' + esc(fmt.acct(r.b) || '-') + '</td>' +
        '<td class="' + tone + '">' + esc(fmt.signed(r.v) || '-') + bar + '</td>' +
        '<td class="' + tone + '">' + esc(fmt.spct(r.vp) || '-') + '</td></tr>';

      if (S.line === i) h += trendRow(r, fmt);
    }
    h += '</tbody></table>';
    bd.innerHTML = h;
    card.appendChild(bd);
    return card;
  }

  /* A per-line month trend, computed on the fly from the same cube. */
  function trendRow(r, fmt) {
    var accts = D.lineAccts[r.idx], a = D.pnl, mask = V.mask;
    var byM = new Float64Array(D.nM), bByM = new Float64Array(D.nM);
    var isAcct = new Uint8Array(D.nA);
    for (var j = 0; j < accts.length; j++) isAcct[accts[j]] = 1;
    for (var i = 0; i < a.length; i += 5) {
      if (!isAcct[a[i]] || !mask.s[a[i + 1]]) continue;
      byM[a[i + 2]] += a[i + 3]; bByM[a[i + 2]] += a[i + 4];
    }
    var lo = Infinity, hi = -Infinity, pts = [], bpts = [];
    for (i = 0; i < D.nM; i++) { lo = Math.min(lo, byM[i], bByM[i]); hi = Math.max(hi, byM[i], bByM[i]); }
    if (!isFinite(lo)) return '';
    var dlo = Math.min(lo, 0), dhi = Math.max(hi, 0);
    if (dhi === dlo) dhi = dlo + 1;
    var W = 560, H = 46, pad = 3, step = D.nM > 1 ? (W - pad * 2) / (D.nM - 1) : 0;
    function y(v) { return pad + (H - pad * 2) * (1 - (v - dlo) / (dhi - dlo)); }
    for (i = 0; i < D.nM; i++) {
      pts.push((pad + i * step).toFixed(1) + ',' + y(byM[i]).toFixed(1));
      bpts.push((pad + i * step).toFixed(1) + ',' + y(bByM[i]).toFixed(1));
    }
    var inRange = '<rect x="' + (pad + mask.m0 * step).toFixed(1) + '" y="0" width="' +
      Math.max(1, (mask.m1 - mask.m0) * step).toFixed(1) + '" height="' + H + '" fill="var(--k-ac2)"/>';
    return '<tr><td colspan="5" style="padding:6px 10px;background:var(--k-sf2)">' +
      '<div style="display:flex;align-items:center;gap:10px">' +
      '<span style="font-size:10.5px;font-weight:700;color:var(--k-mut);white-space:nowrap">' +
      esc(r.label) + ' ' + DOT + ' ' + D.nM + ' months</span>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="flex:1 1 auto;height:34px">' +
      inRange +
      '<polyline points="' + bpts.join(' ') + '" fill="none" stroke="var(--k-fnt)" stroke-width="1.2" ' +
      'stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>' +
      '<polyline points="' + pts.join(' ') + '" fill="none" stroke="var(--k-ac)" stroke-width="1.8" ' +
      'vector-effect="non-scaling-stroke"/></svg>' +
      '<span style="font-size:10.5px;color:var(--k-fnt);white-space:nowrap">shaded = selected period</span>' +
      '</div></td></tr>';
  }

  /* ---- revenue vs budget by month ---------------------------------------- */
  /* Deliberately shows EVERY month, not just the selected window, with the
     window shaded. The point of a trend is the context around the selection. */
  function buildTrend(fmt) {
    var card = el('div', 'k-card is-fixed');
    card.style.flexBasis = '150px';
    var revLine = null, i;
    for (i = 0; i < D.nL; i++) if (D.lines[i][1] === 'Total Revenue') revLine = i;
    if (revLine == null) revLine = 0;

    var accts = D.lineAccts[revLine], isA = new Uint8Array(D.nA);
    for (i = 0; i < accts.length; i++) isA[accts[i]] = 1;
    var a = D.pnl, act = new Float64Array(D.nM), bud = new Float64Array(D.nM);
    for (i = 0; i < a.length; i += 5) {
      if (!isA[a[i]] || !V.mask.s[a[i + 1]]) continue;
      act[a[i + 2]] += a[i + 3]; bud[a[i + 2]] += a[i + 4];
    }

    var hd = el('div', 'k-card-hd');
    hd.innerHTML = '<span class="k-card-t">Revenue vs Budget by month</span>' +
      '<span class="k-card-sp"></span>' +
      '<span class="k-card-n"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;' +
      'background:var(--k-ac);margin-right:4px"></span>Actual' +
      '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;' +
      'background:var(--k-fnt);margin:0 4px 0 10px"></span>Budget</span>';
    card.appendChild(hd);

    var W = 900, H = 108, padL = 12, padR = 10, padT = 8, padB = 12;
    var pw = W - padL - padR, ph = H - padT - padB;
    var mx = 0;
    for (i = 0; i < D.nM; i++) mx = Math.max(mx, act[i], bud[i]);
    mx = niceCeil(mx / 100) * 100;
    if (mx <= 0) mx = 1;
    var step = D.nM > 1 ? pw / (D.nM - 1) : 0;
    function y(v) { return padT + ph - (v / mx) * ph; }

    var ap = [], bp = [];
    for (i = 0; i < D.nM; i++) {
      ap.push((padL + i * step).toFixed(1) + ',' + y(act[i]).toFixed(1));
      bp.push((padL + i * step).toFixed(1) + ',' + y(bud[i]).toFixed(1));
    }
    var o = ['<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="width:100%;height:100%">'];
    o.push('<rect x="' + (padL + V.mask.m0 * step).toFixed(1) + '" y="' + padT + '" width="' +
      Math.max(2, (V.mask.m1 - V.mask.m0) * step).toFixed(1) + '" height="' + ph + '" fill="var(--k-ac2)"/>');
    for (var g = 0; g <= 2; g++) {
      var gy = padT + ph - (g / 2) * ph;
      o.push('<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + gy.toFixed(1) +
        '" stroke="var(--k-grid)" stroke-width="1" vector-effect="non-scaling-stroke"/>');
    }
    o.push('<polyline points="' + bp.join(' ') + '" fill="none" stroke="var(--k-fnt)" stroke-width="1.4" ' +
      'stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>');
    o.push('<polyline points="' + ap.join(' ') + '" fill="none" stroke="var(--k-ac)" stroke-width="2" ' +
      'vector-effect="non-scaling-stroke"/>');
    o.push('</svg>');

    var bd = el('div');
    bd.style.cssText = 'flex:1 1 auto;min-height:0;position:relative;padding:4px 10px 2px;';
    bd.innerHTML = o.join('');
    card.appendChild(bd);

    var ax = el('div');
    ax.style.cssText = 'flex:0 0 auto;display:flex;justify-content:space-between;' +
      'padding:0 12px 7px;font-size:10px;color:var(--k-fnt);';
    ax.innerHTML = '<span>' + esc(D.months[0][1]) + '</span>' +
      '<span style="color:var(--k-ac);font-weight:700">' + esc(fmt.cmp(mx / 100)) + ' peak scale</span>' +
      '<span>' + esc(D.months[D.nM - 1][1]) + '</span>';
    card.appendChild(ax);
    return card;
  }

  /* ---- Pareto ------------------------------------------------------------- */
  var MEAS = [{ k: 'revenue', l: 'Revenue', m: true }, { k: 'units', l: 'Units', m: false }, { k: 'margin', l: 'Margin', m: true }];
  var TOPN = [{ v: 20, l: 'Top 20' }, { v: 50, l: 'Top 50' }, { v: 0, l: 'All' }];

  function buildPareto(agg, fmt) {
    var card = el('div', 'k-card');
    var md = MEAS[0];
    for (var q = 0; q < MEAS.length; q++) if (MEAS[q].k === S.measure) md = MEAS[q];

    var items = [], i;
    for (i = 0; i < D.nP; i++) {
      if (!V.mask.p[i]) continue;
      var v = S.measure === 'revenue' ? agg.rev[i] / 100
        : S.measure === 'units' ? agg.uni[i]
          : (agg.rev[i] - agg.cst[i]) / 100;
      if (!(v > 0)) continue;
      items.push({ p: i, v: v, rev: agg.rev[i] / 100, uni: agg.uni[i], mar: (agg.rev[i] - agg.cst[i]) / 100 });
    }
    items.sort(function (a, b) { return b.v - a.v || a.p - b.p; });
    var total = 0;
    for (i = 0; i < items.length; i++) total += items[i].v;
    var run = 0, n80 = items.length;
    for (i = 0; i < items.length; i++) {
      run += items[i].v; items[i].rank = i + 1; items[i].cum = run / total; items[i].share = items[i].v / total;
      if (items[i].cum >= 0.8 && n80 === items.length) n80 = i + 1;
    }

    var hd = el('div', 'k-card-hd');
    var mc = '';
    for (i = 0; i < MEAS.length; i++) {
      mc += '<button type="button" class="k-chip" data-k="measure" data-v="' + MEAS[i].k +
        '" aria-pressed="' + (MEAS[i].k === S.measure) + '">' + MEAS[i].l + '</button>';
    }
    var tc = '';
    for (i = 0; i < TOPN.length; i++) {
      tc += '<button type="button" class="k-chip" data-k="topn" data-v="' + TOPN[i].v +
        '" aria-pressed="' + (TOPN[i].v === S.topN) + '">' + TOPN[i].l + '</button>';
    }
    hd.innerHTML = '<span class="k-card-t">Product Pareto</span>' + mc +
      '<span class="k-card-sp"></span>' + tc;
    card.appendChild(hd);

    if (!items.length) {
      var bd0 = el('div', 'k-card-bd');
      bd0.appendChild(emptyBox('No product sales', 'Nothing matches the current selection.'));
      card.appendChild(bd0);
      return card;
    }

    var shown = S.topN > 0 ? items.slice(0, Math.min(S.topN, items.length)) : items;
    var chart = el('div', 'k-chart');
    chart.innerHTML = paretoSvg(shown, md, fmt);
    var tip = el('div', 'k-tip');
    chart.appendChild(tip);
    card.appendChild(chart);
    V.tip = tip; V.chart = chart; V.shown = shown; V.md = md;

    var lg = el('div', 'k-lg');
    lg.innerHTML =
      '<span class="k-key"><span class="k-sw" style="background:var(--k-ac)"></span>' +
      n80 + ' of ' + items.length + ' SKUs drive 80% of ' + esc(md.l.toLowerCase()) + '</span>' +
      '<span class="k-key"><span class="k-sw" style="background:var(--k-ln2)"></span>the useful many</span>' +
      '<span class="k-key"><span class="k-sw" style="background:var(--k-amb)"></span>cumulative share</span>' +
      '<span class="k-key">click a bar to filter the page</span>';
    card.appendChild(lg);
    return card;
  }

  function paretoSvg(shown, md, fmt) {
    var W = 1000, H = 330, n = shown.length;
    var labels = n <= 24;
    var padL = 58, padR = 46, padT = 14, padB = labels ? 78 : 26;
    var pw = W - padL - padR, ph = H - padT - padB;
    var step = pw / n, bw = Math.max(1, step * (n > 60 ? 0.86 : 0.66));
    var dmax = 0, i;
    for (i = 0; i < n; i++) dmax = Math.max(dmax, shown[i].v);
    var mx = niceCeil(dmax);

    var o = ['<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" ' +
      'aria-label="Pareto of ' + esc(md.l) + ' by product">'];
    for (var g = 0; g <= 4; g++) {
      var fr = g / 4, gy = padT + (1 - fr) * ph;
      o.push('<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + gy.toFixed(1) +
        '" stroke="var(--k-grid)" stroke-width="1"/>');
      o.push('<text x="' + (W - padR + 7) + '" y="' + (gy + 4).toFixed(1) + '" font-size="11" fill="var(--k-fnt)">' +
        esc(fmt.pct(fr, 0)) + '</text>');
      o.push('<text x="' + (padL - 7) + '" y="' + (gy + 4).toFixed(1) + '" font-size="11" fill="var(--k-fnt)" ' +
        'text-anchor="end">' + esc(fmt.cmp(mx * fr)) + '</text>');
    }
    for (i = 0; i < n; i++) {
      var it = shown[i], x = padL + i * step + (step - bw) / 2;
      var bh = (it.v / mx) * ph, y = padT + ph - bh;
      var on = S.product === it.p;
      var dim = S.product != null && !on;
      var fill = it.cum <= 0.8 ? 'var(--k-ac)' : 'var(--k-ln2)';
      o.push('<g class="k-bar-g' + (dim ? ' is-dim' : (on ? ' is-on' : '')) + '" data-k="bar" data-v="' + i +
        '" tabindex="0" role="button" aria-label="' + esc(it.rank + '. ' + D.products[it.p][2]) + '">');
      o.push('<rect x="' + x.toFixed(1) + '" y="' + padT + '" width="' + bw.toFixed(1) + '" height="' + ph.toFixed(1) +
        '" fill="transparent"/>');
      o.push('<rect class="k-bar" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) +
        '" height="' + Math.max(0.5, bh).toFixed(1) + '" rx="' + (bw > 6 ? 2.5 : 1) + '" fill="' + fill + '"/>');
      if (on) {
        o.push('<rect x="' + (x - 1.5).toFixed(1) + '" y="' + (y - 1.5).toFixed(1) + '" width="' + (bw + 3).toFixed(1) +
          '" height="' + (bh + 3).toFixed(1) + '" rx="3" fill="none" stroke="var(--k-amb)" stroke-width="2"/>');
      }
      o.push('</g>');
      if (labels) {
        var cx = x + bw / 2, ly = padT + ph + 12;
        o.push('<text x="' + cx.toFixed(1) + '" y="' + ly + '" transform="rotate(-40 ' + cx.toFixed(1) + ' ' + ly +
          ')" text-anchor="end" font-size="10.5" fill="var(--k-mut)">' + esc(clip(D.products[it.p][2], 15)) + '</text>');
      }
    }
    var pts = [];
    for (i = 0; i < n; i++) pts.push((padL + i * step + step / 2).toFixed(1) + ',' + (padT + (1 - shown[i].cum) * ph).toFixed(1));
    var ty = padT + 0.2 * ph;
    o.push('<line x1="' + padL + '" y1="' + ty.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + ty.toFixed(1) +
      '" stroke="var(--k-amb)" stroke-width="1.3" stroke-dasharray="6 4"/>');
    o.push('<polyline points="' + pts.join(' ') + '" fill="none" stroke="var(--k-amb)" stroke-width="2" ' +
      'vector-effect="non-scaling-stroke"/>');
    if (!labels) {
      o.push('<text x="' + (padL + pw / 2) + '" y="' + (padT + ph + 18) + '" text-anchor="middle" font-size="11" ' +
        'fill="var(--k-fnt)">' + n + ' products ranked by ' + esc(md.l.toLowerCase()) + '</text>');
    }
    o.push('</svg>');
    return o.join('');
  }

  /* ---- store table -------------------------------------------------------- */
  function buildStores(agg, fmt) {
    /* No fixed height: it shares the column with the Pareto and both fill. */
    var card = el('div', 'k-card');
    var hd = el('div', 'k-card-hd');
    hd.innerHTML = '<span class="k-card-t">' + (S.product != null ? 'Selected product by store' : 'Store performance') +
      '</span><span class="k-card-sp"></span><span class="k-card-n">click a row to filter</span>';
    card.appendChild(hd);

    /* Operating profit per store, straight from the cube. */
    var opAccts = D.lineAccts[D.nL - 1], isA = new Uint8Array(D.nA), i;
    for (i = 0; i < opAccts.length; i++) isA[opAccts[i]] = 1;
    var opByStore = new Float64Array(D.nS), a = D.pnl;
    for (i = 0; i < a.length; i += 5) {
      if (!isA[a[i]] || !V.mask.m[a[i + 2]]) continue;
      opByStore[a[i + 1]] += a[i + 3];
    }

    /* product-by-store when a product is selected */
    var prodByStore = null;
    if (S.product != null) {
      prodByStore = new Float64Array(D.nS);
      var s = D.sales;
      for (i = 0; i < s.length; i += 6) {
        if (s[i] !== S.product || !V.mask.m[s[i + 2]]) continue;
        prodByStore[s[i + 1]] += s[i + 3];
      }
    }

    var rows = [];
    for (i = 0; i < D.nS; i++) {
      if (!V.mask.s[i]) continue;
      rows.push({
        i: i, name: D.stores[i][2], region: D.stores[i][3], tier: D.stores[i][4],
        rev: (prodByStore ? prodByStore[i] : agg.revByStore[i]) / 100,
        op: opByStore[i] / 100
      });
    }
    rows.sort(function (x, y) { return y.rev - x.rev; });

    var bd = el('div', 'k-card-bd');
    var h = '<table class="k-tbl"><thead><tr><th>Store</th><th>Region</th>' +
      '<th>' + (prodByStore ? 'Product revenue' : 'Revenue') + '</th><th>Op profit</th><th>Margin</th></tr></thead><tbody>';
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      var m = r.rev ? r.op / r.rev : null;
      h += '<tr class="k-row-click' + (S.stores[r.i] ? ' is-on' : '') + '" data-k="store" data-v="' + r.i + '">' +
        '<td>' + esc(r.name) + '</td><td class="k-mut">' + esc(r.region) + '</td>' +
        '<td>' + esc(fmt.money(r.rev) || '-') + '</td>' +
        '<td class="' + (r.op >= 0 ? 'k-pos' : 'k-neg') + '">' + esc(fmt.money(r.op) || '-') + '</td>' +
        '<td class="k-mut">' + esc(prodByStore ? '-' : (fmt.pct(m) || '-')) + '</td></tr>';
    }
    h += '</tbody></table>';
    bd.innerHTML = h;
    card.appendChild(bd);
    return card;
  }

  /* =========================================================================
   * EVENTS
   * ====================================================================== */
  function closest(n, sel) {
    while (n && n !== document) {
      if (n.nodeType === 1) {
        var f = n.matches || n.msMatchesSelector || n.webkitMatchesSelector;
        if (f && f.call(n, sel)) return n;
      }
      n = n.parentNode;
    }
    return null;
  }

  function wire(root) {
    root.addEventListener('click', function (e) {
      var t = closest(e.target, '[data-k]');
      if (!t) return;
      var k = t.getAttribute('data-k'), v = t.getAttribute('data-v');

      if (k === 'region') { toggle(S.regions, v); S.stores = {}; }
      else if (k === 'cat') { toggle(S.cats, v); }
      else if (k === 'store') { toggle(S.stores, v); }
      else if (k === 'measure') { S.measure = v; }
      else if (k === 'topn') { S.topN = parseInt(v, 10) || 0; }
      else if (k === 'line') { var i = parseInt(v, 10); S.line = (S.line === i ? null : i); }
      else if (k === 'bar') {
        var it = V.shown[parseInt(v, 10)];
        if (it) S.product = (S.product === it.p ? null : it.p);
      }
      else if (k === 'clear-product') { S.product = null; }
      else if (k === 'reset') {
        S.m0 = S.m1 = null; S.regions = {}; S.stores = {}; S.cats = {};
        S.product = null; S.line = null;
      } else return;
      schedule();
    });

    root.addEventListener('change', function (e) {
      var id = e.target && e.target.id;
      if (id === 'k-m0') { S.m0 = parseInt(e.target.value, 10); if (S.m1 == null) S.m1 = D.nM - 1; }
      else if (id === 'k-m1') { S.m1 = parseInt(e.target.value, 10); if (S.m0 == null) S.m0 = 0; }
      else if (id === 'k-store') {
        S.stores = {};
        if (e.target.value !== '') S.stores[e.target.value] = true;
      } else return;
      schedule();
    });

    root.addEventListener('keydown', function (e) {
      var b = closest(e.target, '[data-k="bar"]');
      if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); b.click(); }
    });

    root.addEventListener('mousemove', function (e) {
      var b = closest(e.target, '[data-k="bar"]');
      if (!b || !V.tip || !V.chart) { if (V.tip) V.tip.classList.remove('is-on'); return; }
      var it = V.shown[parseInt(b.getAttribute('data-v'), 10)];
      if (!it) return;
      var p = D.products[it.p], f = V.fmt;
      V.tip.innerHTML = '<b>' + esc(it.rank + '. ' + p[2]) + '</b><br>' +
        esc(p[1]) + ' ' + DOT + ' ' + esc(p[3]) + '<br>' +
        esc(V.md.l) + ' <b>' + esc(V.md.m ? f.money(it.v) : f.num(it.v)) + '</b> (' + esc(f.pct(it.share)) + ')<br>' +
        'Cumulative <b>' + esc(f.pct(it.cum)) + '</b>';
      V.tip.classList.add('is-on');
      var cr = V.chart.getBoundingClientRect(), br = b.getBoundingClientRect();
      var x = br.left + br.width / 2 - cr.left, y = e.clientY - cr.top - 10;
      var tw = V.tip.offsetWidth, th = V.tip.offsetHeight;
      x = Math.max(tw / 2 + 4, Math.min(x, cr.width - tw / 2 - 4));
      y = Math.max(th + 4, y);
      V.tip.style.left = Math.round(x) + 'px';
      V.tip.style.top = Math.round(y) + 'px';
    });
    root.addEventListener('mouseleave', function () { if (V.tip) V.tip.classList.remove('is-on'); });
  }

  function toggle(obj, k) { if (obj[k]) delete obj[k]; else obj[k] = true; }

  /* =========================================================================
   * BOOT
   * ====================================================================== */
  function ensureStyles() {
    if (document.getElementById('tpp-css')) return;
    var s = document.createElement('style');
    s.id = 'tpp-css';
    s.appendChild(document.createTextNode(CSS));
    (document.head || document.documentElement).appendChild(s);
  }
  function ensureRoot() {
    var c = document.getElementById('tpp-root') || document.querySelector('[data-tpp-root]');
    if (!c) { c = document.createElement('div'); c.id = 'tpp-root'; (document.body || document.documentElement).appendChild(c); }
    return c;
  }

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
    if (!window.__tpPage && !rendered && tries < 12 && document.readyState !== 'complete') {
      tries++; timer = setTimeout(attempt, 24); return;
    }
    schedule();
  }
  function fail(e) {
    try {
      ensureRoot().innerHTML = '<div style="font:13px/1.6 Segoe UI,Arial,sans-serif;padding:18px;color:#dc2626">' +
        '<b>TrailPeak page failed to render.</b><br>v' + VERSION + ' ' + DOT + ' ' +
        esc(e && e.message ? e.message : String(e)) + '</div>';
      if (window.console && console.error) console.error('[tpp]', e);
    } catch (x) { /* nothing left */ }
  }

  window.TPP = {
    __installed: VERSION, version: VERSION,
    boot: boot, render: schedule, state: S,
    _dbg: function () { return { D: D, V: V }; }
  };
  boot();
})();
