/*!
 * TrailPeak Outfitters - Power BI report visuals, rendered in JavaScript
 * ---------------------------------------------------------------------------
 * Repo    : https://github.com/sulaiman013/dax-with-js
 * Serve   : https://cdn.jsdelivr.net/gh/sulaiman013/dax-with-js@vX.Y.Z/trailpeak/trailpeak.js
 * License : MIT
 *
 * WHAT THIS REPLACES
 * ---------------------------------------------------------------------------
 * The original report built its two bespoke pages as single DAX measures that
 * concatenated HTML and SVG by hand:
 *
 *   [HTML P&L Statement]   ~80 lines of DAX, 5 inline style attributes per row
 *   [HTML Pareto Analysis] ~125 lines of DAX computing SVG geometry in VARs
 *
 * and then rebuilt the same two pages in Deneb, which needed seven extra
 * measures whose only job was pre-formatting text and hex colours, because a
 * Vega-Lite spec cannot format a number the way a business user expects.
 *
 * Here the split is different, and it is the whole point:
 *
 *   DAX  returns DATA.        One row per entity, each measure evaluated once.
 *   JS   does everything else. Layout, geometry, ranking, cumulative maths,
 *                              number formatting, colour, and interaction.
 *
 * Consequences, all of them measurable:
 *
 *   - The seven presentation-only measures ([Line Actual Text],
 *     [Line Budget Text], [Line Variance Text], [Line Var % Text],
 *     [Line Variance Color], [Pareto Bar Color], [Pareto Cum Label]) are no
 *     longer needed by anything. JavaScript formats and colours.
 *   - [Product Rank], [Cumulative Revenue], [Cumulative Revenue %] and
 *     [Revenue Share %] leave the query path. The originals are O(n^2): each
 *     one runs a SUMX over a FILTER over ALLSELECTED(dim_product), once per
 *     product, and the Pareto measure called them across three separate
 *     CONCATENATEX passes. Here DAX emits [Product Revenue] once per product
 *     and this file ranks and cumulates in O(n log n).
 *   - The Pareto is no longer capped at 20 bars. The DAX version capped it
 *     because hand-placing 120 rotated SVG labels in DAX is untenable.
 *
 * SANDBOX CONSTRAINTS THIS FILE IS BUILT AROUND
 * ---------------------------------------------------------------------------
 * Power BI custom visuals run in an iframe sandboxed `allow-scripts` WITHOUT
 * `allow-same-origin`, so the document has a null origin:
 *
 *   - No cookies, no localStorage, no sessionStorage. UI state lives on
 *     window.__tpState, which survives the DOM replacement but not a reload.
 *   - The host rewrites its DOM and re-inserts the script tags on every
 *     cross-filter, resize and refresh. Everything here is idempotent.
 *   - Load order is not guaranteed. The inline data script may run before or
 *     after this file; both directions work.
 *   - Requires the REGULAR HTML Content visual. The `lite` edition is
 *     certified but blocks all external URLs, so it cannot load this at all.
 *     The original prototypes targeted lite; that must change.
 *
 * DATA CONTRACT - window.__tpData
 * ---------------------------------------------------------------------------
 * All money is INTEGER MINOR UNITS (cents). DAX FORMAT() emits locale
 * dependent decimal and thousand separators, so a de-DE workspace would
 * otherwise turn 1234.56 into "1234,56" and break the payload. FORMAT(x, "0")
 * emits no separator in any locale. Ratios are integer basis points.
 *
 *   window.__tpData = {
 *     page: 'pnl' | 'pareto' | 'kpi',
 *     locale: 'en-US', currency: 'USD',
 *     meta: { title, company, period, scope, dataThrough, footnote },
 *
 *     pnl: {
 *       rows: [ { key, label, rowType, indent, bold, actual, budget } ],
 *       // rowType: 'Detail' | 'Group' | 'Subtotal' | 'Total'
 *       // actual/budget in cents, or null for a genuine blank
 *       children: { "100": [ { label, actual, budget } ] },   // optional
 *       series:   { "40": [ { m: '2026-01', a: 123, b: 456 } ] } // optional
 *     },
 *
 *     pareto: {
 *       products: [ { key, sku, name, category, revenue, units, margin } ]
 *       // UNRANKED and UNSORTED on purpose. This file ranks and cumulates.
 *     },
 *
 *     kpis: [ { label, value, format, delta, tone, spark: [] } ]
 *   }
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';

  /* Re-execution guard. The host re-inserts this script on every cross-filter;
     rebuilding the closure each time would leak listeners and duplicate state. */
  if (window.TP && window.TP.__installed === VERSION && typeof window.TP.boot === 'function') {
    window.TP.boot();
    return;
  }

  /* =========================================================================
   * 1. DESIGN TOKENS
   * Lifted from the original canvas HTML and prototype DAX so the rebuild is
   * visually continuous with the report it replaces.
   * ====================================================================== */

  var CSS = [
    ':root{',
    '--tp-ink:#0f172a;--tp-muted:#64748b;--tp-faint:#94a3b8;--tp-line:#e2e8f0;',
    '--tp-line-2:#cbd5e1;--tp-surface:#ffffff;--tp-surface-2:#f8fafc;',
    '--tp-accent:#2d6a4f;--tp-accent-soft:#f4faf6;--tp-accent-line:#cde3d6;',
    '--tp-pos:#16a34a;--tp-neg:#dc2626;--tp-amber:#d97706;--tp-amber-ink:#b45309;',
    '--tp-grid:#eef2f7;',
    '--tp-shadow:0 1px 2px rgba(15,23,42,.05),0 8px 24px -14px rgba(15,23,42,.18);',
    '}',

    /* Defensive neutraliser. The guide uses semantic tags and the host document
       may carry element-level styles. A bare `table {...}` in the host is
       specificity (0,0,1); this is (0,1,0) and wins. Component rules below are
       also (0,1,0)+ and come later in source order, so they win over this.
       `font` is deliberately not reset: CSS beats SVG presentation attributes
       and it would clobber the font-size attributes on chart labels. */
    '.tp-root *{background-color:transparent;background-image:none;border:0;',
    'margin:0;padding:0;color:inherit;text-align:inherit;text-transform:none;',
    'letter-spacing:normal;list-style:none;text-decoration:none;box-shadow:none;',
    'float:none;text-indent:0;vertical-align:baseline;}',
    '.tp-root *,.tp-root *::before,.tp-root *::after{box-sizing:border-box;}',

    'html,body{margin:0;padding:0;height:100%;background:transparent;}',
    'body{overflow:hidden;}',
    '.tp-root{height:100%;',
    "font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;",
    'font-size:13.5px;line-height:1.45;color:var(--tp-ink);',
    '-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums;}',
    '.tp-root button,.tp-root input,.tp-root select{font:inherit;color:inherit;}',

    /* ---- card shell ---------------------------------------------------- */
    '.tp-card{display:flex;flex-direction:column;height:100vh;max-height:100%;',
    'background:var(--tp-surface);border:1px solid var(--tp-line);border-radius:12px;',
    'padding:16px 22px;overflow:hidden;position:relative;}',
    '.tp-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:2px;}',
    '.tp-title{font-size:19px;font-weight:700;color:var(--tp-ink);letter-spacing:-.01em;}',
    '.tp-brand{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;',
    'color:var(--tp-accent);white-space:nowrap;}',
    '.tp-sub{font-size:13px;color:var(--tp-muted);margin-bottom:10px;}',
    '.tp-foot{margin-top:10px;font-size:11.5px;color:var(--tp-faint);flex:0 0 auto;}',
    '.tp-body{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;}',

    /* ---- toolbar ------------------------------------------------------- */
    '.tp-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:10px;flex:0 0 auto;}',
    '.tp-bar-sp{flex:1 1 auto;}',
    '.tp-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 11px;border-radius:999px;',
    'border:1px solid var(--tp-line);background:var(--tp-surface);color:var(--tp-muted);',
    'font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;',
    'transition:background .13s,color .13s,border-color .13s;}',
    '.tp-chip:hover{border-color:var(--tp-line-2);color:var(--tp-ink);}',
    '.tp-chip[aria-pressed="true"]{background:var(--tp-accent);border-color:var(--tp-accent);color:#fff;}',
    '.tp-pill{display:inline-flex;align-items:center;font-size:13px;font-weight:600;',
    'color:var(--tp-accent);background:var(--tp-accent-soft);border:1px solid var(--tp-accent-line);',
    'border-radius:999px;padding:4px 12px;white-space:nowrap;}',
    '.tp-lab{font-size:11.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;',
    'color:var(--tp-faint);white-space:nowrap;}',
    '.tp-root :focus-visible{outline:2px solid var(--tp-accent);outline-offset:2px;border-radius:4px;}',

    /* ---- slider -------------------------------------------------------- */
    '.tp-range{-webkit-appearance:none;appearance:none;width:132px;height:4px;border-radius:99px;',
    'background:var(--tp-line);outline:none;cursor:pointer;}',
    '.tp-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:14px;height:14px;',
    'border-radius:50%;background:var(--tp-amber);border:2px solid #fff;',
    'box-shadow:0 1px 3px rgba(15,23,42,.3);cursor:pointer;}',
    '.tp-range::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:var(--tp-amber);',
    'border:2px solid #fff;box-shadow:0 1px 3px rgba(15,23,42,.3);cursor:pointer;}',

    /* ---- P&L table ----------------------------------------------------- */
    '.tp-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;}',
    '.tp-scroll::-webkit-scrollbar{width:9px;}',
    '.tp-scroll::-webkit-scrollbar-thumb{background:var(--tp-line-2);border-radius:99px;',
    'border:2px solid var(--tp-surface);}',
    '.tp-tbl{width:100%;border-collapse:collapse;font-size:13.5px;}',
    '.tp-tbl thead th{position:sticky;top:0;z-index:2;background:var(--tp-surface);',
    'padding:6px 10px;font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;',
    'color:var(--tp-muted);font-weight:600;border-bottom:2px solid var(--tp-ink);white-space:nowrap;}',
    '.tp-tbl th.tp-r,.tp-tbl td.tp-r{text-align:right;}',
    '.tp-tbl th.tp-l,.tp-tbl td.tp-l{text-align:left;}',
    '.tp-tbl td{padding:7px 10px;color:var(--tp-ink);}',
    '.tp-row{transition:background .1s;}',
    '.tp-row:hover{background:var(--tp-surface-2);}',
    '.tp-row.is-sub>td{border-top:1px solid var(--tp-line-2);font-weight:600;}',
    '.tp-row.is-total>td{border-top:2px solid var(--tp-ink);background:var(--tp-accent-soft);font-weight:600;}',
    '.tp-row.is-total:hover>td{background:#eaf5ee;}',
    '.tp-row.is-open>td{background:var(--tp-surface-2);}',
    '.tp-row.is-group .tp-label{cursor:pointer;}',
    '.tp-num{color:var(--tp-ink);white-space:nowrap;}',
    '.tp-num.is-muted{color:var(--tp-muted);}',
    '.tp-pos{color:var(--tp-pos);}',
    '.tp-neg{color:var(--tp-neg);}',
    '.tp-nil{color:var(--tp-faint);}',
    '.tp-label{display:flex;align-items:center;gap:6px;}',
    '.tp-caret{flex:0 0 auto;width:13px;height:13px;color:var(--tp-faint);',
    'transition:transform .16s ease;}',
    '.tp-row.is-open .tp-caret{transform:rotate(90deg);}',
    '.tp-kid>td{padding-top:4px;padding-bottom:4px;font-size:12.5px;color:var(--tp-muted);',
    'background:var(--tp-surface-2);}',
    '.tp-kid .tp-num{color:var(--tp-muted);}',

    /* variance bar */
    '.tp-vbar{position:relative;display:block;width:100%;height:4px;margin-top:3px;',
    'background:var(--tp-line);border-radius:2px;overflow:hidden;}',
    '.tp-vbar span{position:absolute;top:0;height:100%;border-radius:2px;',
    'transition:width .3s cubic-bezier(.22,.7,.3,1),left .3s cubic-bezier(.22,.7,.3,1);}',

    /* ---- sparkline panel ----------------------------------------------- */
    '.tp-panel{flex:0 0 auto;margin-top:8px;padding:11px 13px;border:1px solid var(--tp-line);',
    'border-radius:9px;background:var(--tp-surface-2);display:none;}',
    '.tp-panel.is-on{display:block;}',
    '.tp-panel-head{display:flex;align-items:baseline;gap:9px;margin-bottom:6px;}',
    '.tp-panel-t{font-size:13px;font-weight:650;color:var(--tp-ink);}',
    '.tp-panel-x{margin-left:auto;border:0;background:none;color:var(--tp-faint);cursor:pointer;',
    'font-size:12px;font-weight:600;padding:2px 6px;border-radius:5px;}',
    '.tp-panel-x:hover{background:var(--tp-line);color:var(--tp-ink);}',

    /* ---- chart --------------------------------------------------------- */
    '.tp-chart{flex:1 1 auto;min-height:0;position:relative;margin-top:2px;}',
    '.tp-chart svg{display:block;width:100%;height:100%;overflow:visible;}',
    '.tp-bar{cursor:pointer;transition:opacity .12s;}',
    '.tp-bar:hover{opacity:.78;}',
    '.tp-bar-g:focus-visible{outline:none;}',
    '.tp-bar-g:focus-visible .tp-hit{stroke:var(--tp-accent);stroke-width:2;}',
    '@media (prefers-reduced-motion:no-preference){',
    '.tp-anim rect.tp-bar{transition:y .4s cubic-bezier(.22,.7,.3,1),height .4s cubic-bezier(.22,.7,.3,1),fill .25s;}',
    '.tp-anim .tp-cum{transition:d .4s cubic-bezier(.22,.7,.3,1);}',
    '}',
    '.tp-tip{position:absolute;z-index:9;pointer-events:none;opacity:0;transform:translate(-50%,-100%);',
    'padding:8px 11px;border-radius:8px;background:var(--tp-ink);color:#fff;font-size:12px;',
    'line-height:1.55;box-shadow:0 8px 24px -8px rgba(15,23,42,.5);white-space:nowrap;',
    'transition:opacity .11s;}',
    '.tp-tip.is-on{opacity:1;}',
    '.tp-tip b{font-weight:700;}',
    '.tp-tip i{font-style:normal;opacity:.7;}',
    '.tp-legend{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;',
    'font-size:11.5px;color:var(--tp-faint);margin-top:8px;flex:0 0 auto;}',
    '.tp-key{display:inline-flex;align-items:center;gap:6px;}',
    '.tp-sw{width:9px;height:9px;border-radius:2px;flex:0 0 auto;}',

    /* ---- KPI cards ----------------------------------------------------- */
    '.tp-kpis{display:grid;gap:10px;height:100%;',
    'grid-template-columns:repeat(auto-fit,minmax(150px,1fr));}',
    '.tp-kpi{border:1px solid var(--tp-line);border-radius:10px;background:var(--tp-surface);',
    'padding:12px 14px;display:flex;flex-direction:column;justify-content:space-between;',
    'min-height:0;transition:border-color .14s,box-shadow .14s;}',
    '.tp-kpi:hover{border-color:var(--tp-line-2);box-shadow:var(--tp-shadow);}',
    '.tp-kpi-l{font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;',
    'color:var(--tp-faint);margin-bottom:5px;}',
    '.tp-kpi-v{font-size:23px;font-weight:700;letter-spacing:-.02em;color:var(--tp-ink);line-height:1.1;}',
    '.tp-kpi-d{font-size:12px;font-weight:600;margin-top:4px;}',
    '.tp-kpi-s{margin-top:7px;height:26px;}',
    '.tp-kpi-s svg{display:block;width:100%;height:100%;overflow:visible;}',

    /* ---- empty / error ------------------------------------------------- */
    '.tp-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;',
    'height:100%;gap:6px;color:var(--tp-muted);text-align:center;padding:24px;}',
    '.tp-empty-t{font-size:14px;font-weight:600;color:var(--tp-ink);}',
    '.tp-empty-d{font-size:12.5px;color:var(--tp-faint);max-width:300px;}',
    '.tp-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;',
    'clip:rect(0 0 0 0);white-space:nowrap;border:0;}',

    /* ---- responsive ---------------------------------------------------- */
    '@media (max-width:640px){',
    '.tp-card{padding:12px 14px;}',
    '.tp-title{font-size:16px;}',
    '.tp-brand{display:none;}',
    '.tp-tbl{font-size:12.5px;}',
    '.tp-tbl td,.tp-tbl thead th{padding:5px 6px;}',
    '}',
    '@media print{',
    'html,body{height:auto;overflow:visible;}',
    '.tp-card{height:auto;max-height:none;border:0;padding:0;}',
    '.tp-bar,.tp-panel{display:none !important;}',
    '.tp-scroll{overflow:visible;}',
    '}'
  ].join('');

  /* =========================================================================
   * 2. UTILITIES
   * ====================================================================== */

  var MINUS = String.fromCharCode(0x2212);
  var NBSP = String.fromCharCode(0xA0);

  var state = window.__tpState || (window.__tpState = {
    openRows: {}, activeRow: null, cols: null,
    threshold: 0.80, measure: 'revenue', topN: 0, colorBy: 'pareto'
  });

  var view = {};

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /* Money arrives as integer minor units. Anything non-numeric is a genuine
     blank and must render as a dash, never as a zero. */
  function toMajor(v) { return isNum(v) ? v / 100 : null; }

  function makeFmt(locale, currency) {
    function nf(opts) {
      try { return new Intl.NumberFormat(locale || 'en-US', opts); }
      catch (e) { return null; }
    }
    var whole = nf({ maximumFractionDigits: 0 });
    var money0 = nf({ style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 });
    var pct1 = nf({ style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
    var pct0 = nf({ style: 'percent', maximumFractionDigits: 0 });

    function group(n) {
      return Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    /* Accounting style: negatives in parentheses, matching the original
       "#,##0;(#,##0)" format strings the DAX used. */
    function acct(v) {
      if (!isNum(v)) return null;
      var s = whole ? whole.format(Math.abs(v)) : group(v);
      return v < 0 ? '(' + s + ')' : s;
    }
    return {
      acct: acct,
      num: function (v) { return isNum(v) ? (whole ? whole.format(v) : group(v)) : null; },
      money: function (v) { return isNum(v) ? (money0 ? money0.format(v) : '$' + group(v)) : null; },
      signed: function (v) {
        if (!isNum(v)) return null;
        if (v === 0) return '0';
        var s = whole ? whole.format(Math.abs(v)) : group(v);
        return v > 0 ? '+' + s : '(' + s + ')';
      },
      pct: function (v, dp) {
        if (!isNum(v)) return null;
        var f = dp === 0 ? pct0 : pct1;
        return f ? f.format(v) : (v * 100).toFixed(dp === 0 ? 0 : 1) + '%';
      },
      signedPct: function (v) {
        if (!isNum(v)) return null;
        var s = pct1 ? pct1.format(Math.abs(v)) : (Math.abs(v) * 100).toFixed(1) + '%';
        if (v === 0) return s;
        return v > 0 ? '+' + s : '(' + s + ')';
      },
      compact: function (v) {
        if (!isNum(v)) return null;
        var a = Math.abs(v), sign = v < 0 ? MINUS : '';
        if (a >= 1e9) return sign + (a / 1e9).toFixed(1) + 'B';
        if (a >= 1e6) return sign + (a / 1e6).toFixed(1) + 'M';
        if (a >= 1e3) return sign + Math.round(a / 1e3) + 'K';
        return sign + Math.round(a);
      }
    };
  }

  function readData() {
    var raw = window.__tpData;
    if (!raw || typeof raw !== 'object') return null;
    return raw;
  }

  function svgEl(paths, size, extra) {
    var s = size || 14;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true" focusable="false"' + (extra ? ' ' + extra : '') + '>' + paths + '</svg>';
  }
  var IC = {
    caret: function () { return svgEl('<path d="M9 6l6 6-6 6"/>', 13); },
    close: function () { return svgEl('<path d="M6 6l12 12M18 6L6 18"/>', 12); }
  };

  /* =========================================================================
   * 3. SHARED CHROME
   * ====================================================================== */

  function buildCard(meta, opts) {
    var card = el('div', 'tp-card');
    var head = el('div', 'tp-head');
    head.appendChild(el('div', 'tp-title', esc(meta.title || '')));
    if (meta.company) head.appendChild(el('div', 'tp-brand', esc(meta.company)));
    card.appendChild(head);
    if (meta.subtitle) card.appendChild(el('div', 'tp-sub', esc(meta.subtitle)));
    var body = el('div', 'tp-body');
    card.appendChild(body);
    if (meta.footnote || meta.dataThrough) {
      var f = [meta.dataThrough, meta.footnote].filter(Boolean).join(' ' + String.fromCharCode(0xB7) + ' ');
      card.appendChild(el('div', 'tp-foot', esc(f)));
    }
    return { card: card, body: body };
  }

  function chip(label, act, val, pressed, extra) {
    var b = el('button', 'tp-chip');
    b.type = 'button';
    b.setAttribute('data-tp-act', act);
    if (val != null) b.setAttribute('data-tp-val', String(val));
    b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    b.innerHTML = esc(label) + (extra || '');
    return b;
  }

  function emptyState(title, detail) {
    var e = el('div', 'tp-empty');
    e.innerHTML = '<div class="tp-empty-t">' + esc(title) + '</div>' +
      '<div class="tp-empty-d">' + esc(detail || '') + '</div>';
    return e;
  }

  /* =========================================================================
   * 4. P&L STATEMENT
   * ====================================================================== */

  var PNL_COLS = [
    { key: 'actual', label: 'Actual' },
    { key: 'budget', label: 'Budget' },
    { key: 'variance', label: 'Variance' },
    { key: 'variancePct', label: 'Var %' },
    { key: 'pctRev', label: '% of Rev' }
  ];
  var PNL_DEFAULT_COLS = { actual: 1, budget: 1, variance: 1, variancePct: 1, pctRev: 0 };

  function renderPnl(data, fmt) {
    var pnl = data.pnl || {};
    var rows = pnl.rows || [];
    var shell = buildCard(data.meta || {});
    if (!rows.length) {
      shell.body.appendChild(emptyState('No statement rows',
        'The measure returned no P&L layout rows for the current selection.'));
      return shell.card;
    }

    if (!state.cols) {
      state.cols = {};
      for (var c in PNL_DEFAULT_COLS) state.cols[c] = !!PNL_DEFAULT_COLS[c];
    }

    /* Derived values. This is arithmetic DAX used to do per row, per column. */
    var totalRevenue = null;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      r._a = toMajor(r.actual);
      r._b = toMajor(r.budget);
      r._v = (isNum(r._a) && isNum(r._b)) ? r._a - r._b : null;
      r._vp = (isNum(r._v) && isNum(r._b) && r._b !== 0) ? r._v / Math.abs(r._b) : null;
      if (/^total revenue$/i.test(r.label) && isNum(r._a)) totalRevenue = r._a;
    }
    for (i = 0; i < rows.length; i++) {
      rows[i]._pr = (isNum(rows[i]._a) && isNum(totalRevenue) && totalRevenue !== 0)
        ? rows[i]._a / totalRevenue : null;
    }
    /* Variance bars share one scale so magnitudes are comparable down the page. */
    var maxAbsVar = 0;
    for (i = 0; i < rows.length; i++) {
      if (isNum(rows[i]._v)) maxAbsVar = Math.max(maxAbsVar, Math.abs(rows[i]._v));
    }

    /* toolbar */
    var bar = el('div', 'tp-bar');
    bar.appendChild(el('span', 'tp-lab', 'Columns'));
    for (i = 0; i < PNL_COLS.length; i++) {
      bar.appendChild(chip(PNL_COLS[i].label, 'pnl-col', PNL_COLS[i].key, !!state.cols[PNL_COLS[i].key]));
    }
    bar.appendChild(el('span', 'tp-bar-sp'));
    var favourable = 0, adverse = 0;
    for (i = 0; i < rows.length; i++) {
      if (!isNum(rows[i]._v) || rows[i].rowType === 'Total' || rows[i].rowType === 'Subtotal') continue;
      if (rows[i]._v >= 0) favourable++; else adverse++;
    }
    bar.appendChild(el('span', 'tp-pill',
      adverse + ' of ' + (favourable + adverse) + ' lines behind plan'));
    shell.body.appendChild(bar);

    /* table */
    var scroll = el('div', 'tp-scroll');
    var tbl = el('table', 'tp-tbl');
    var thead = '<thead><tr><th class="tp-l" scope="col">Line</th>';
    for (i = 0; i < PNL_COLS.length; i++) {
      if (!state.cols[PNL_COLS[i].key]) continue;
      thead += '<th class="tp-r" scope="col">' + esc(PNL_COLS[i].label) + '</th>';
    }
    thead += '</tr></thead>';

    var tbody = '<tbody>';
    for (i = 0; i < rows.length; i++) {
      tbody += pnlRow(rows[i], fmt, maxAbsVar, pnl);
      var kids = pnl.children && pnl.children[String(rows[i].key)];
      if (kids && state.openRows[rows[i].key]) {
        for (var k = 0; k < kids.length; k++) {
          tbody += pnlKidRow(kids[k], rows[i], fmt);
        }
      }
    }
    tbody += '</tbody>';
    tbl.innerHTML = thead + tbody;
    scroll.appendChild(tbl);
    shell.body.appendChild(scroll);

    /* trend panel */
    var panel = el('div', 'tp-panel');
    panel.id = 'tp-panel';
    shell.body.appendChild(panel);
    view.panel = panel;
    view.pnlRows = rows;
    view.pnlSeries = pnl.series || null;
    view.fmt = fmt;

    if (state.activeRow != null && view.pnlSeries) showTrend(state.activeRow);
    return shell.card;
  }

  function pnlRow(r, fmt, maxAbsVar, pnl) {
    var isTotal = r.rowType === 'Total';
    var isSub = r.rowType === 'Subtotal';
    var isGroup = r.rowType === 'Group';
    var hasKids = !!(pnl.children && pnl.children[String(r.key)]);
    var hasSeries = !!(pnl.series && pnl.series[String(r.key)]);
    var open = !!state.openRows[r.key];

    var cls = 'tp-row' + (isTotal ? ' is-total' : '') + (isSub ? ' is-sub' : '') +
      (isGroup && hasKids ? ' is-group' : '') + (open ? ' is-open' : '');
    var pad = 10 + (r.indent || 0) * 18;

    var out = '<tr class="' + cls + '" data-tp-row="' + esc(r.key) + '"' +
      (hasSeries ? ' data-tp-series="1"' : '') + '>';

    out += '<td class="tp-l" style="padding-left:' + pad + 'px;font-weight:' +
      (r.bold ? '600' : '400') + '">' +
      '<span class="tp-label"' + (hasKids ? ' data-tp-act="pnl-toggle" data-tp-val="' + esc(r.key) + '" role="button" tabindex="0" aria-expanded="' + (open ? 'true' : 'false') + '"' : '') + '>' +
      (hasKids ? '<span class="tp-caret">' + IC.caret() + '</span>' : '') +
      esc(r.label) + '</span></td>';

    if (state.cols.actual) out += numCell(fmt.acct(r._a), r.bold, false);
    if (state.cols.budget) out += numCell(fmt.acct(r._b), false, true);
    if (state.cols.variance) {
      var txt = fmt.signed(r._v);
      var tone = !isNum(r._v) ? 'tp-nil' : (r._v >= 0 ? 'tp-pos' : 'tp-neg');
      out += '<td class="tp-r"><span class="tp-num ' + tone + '" style="font-weight:' +
        (r.bold ? '600' : '400') + '">' + (txt == null ? '-' : esc(txt)) + '</span>' +
        varBar(r._v, maxAbsVar) + '</td>';
    }
    if (state.cols.variancePct) {
      var pt = fmt.signedPct(r._vp);
      var ptone = !isNum(r._vp) ? 'tp-nil' : (r._vp >= 0 ? 'tp-pos' : 'tp-neg');
      out += '<td class="tp-r"><span class="tp-num ' + ptone + '">' +
        (pt == null ? '-' : esc(pt)) + '</span></td>';
    }
    if (state.cols.pctRev) {
      var pr = fmt.pct(r._pr);
      out += '<td class="tp-r"><span class="tp-num is-muted">' +
        (pr == null ? '-' : esc(pr)) + '</span></td>';
    }
    return out + '</tr>';
  }

  function numCell(text, bold, muted) {
    return '<td class="tp-r"><span class="tp-num' + (muted ? ' is-muted' : '') +
      '" style="font-weight:' + (bold ? '600' : '400') + '">' +
      (text == null ? '-' : esc(text)) + '</span></td>';
  }

  /* Diverging bar centred on zero: left half adverse, right half favourable. */
  function varBar(v, maxAbs) {
    if (!isNum(v) || !maxAbs) return '';
    var freq = Math.min(1, Math.abs(v) / maxAbs) * 50;
    var left = v >= 0 ? 50 : 50 - freq;
    var colour = v >= 0 ? 'var(--tp-pos)' : 'var(--tp-neg)';
    return '<span class="tp-vbar"><span style="left:' + left.toFixed(2) + '%;width:' +
      freq.toFixed(2) + '%;background:' + colour + '"></span></span>';
  }

  function pnlKidRow(kid, parent, fmt) {
    var a = toMajor(kid.actual), b = toMajor(kid.budget);
    var v = (isNum(a) && isNum(b)) ? a - b : null;
    var vp = (isNum(v) && isNum(b) && b !== 0) ? v / Math.abs(b) : null;
    var pad = 10 + ((parent.indent || 0) + 1) * 18 + 13;
    var out = '<tr class="tp-row tp-kid"><td class="tp-l" style="padding-left:' + pad + 'px">' +
      esc(kid.label) + '</td>';
    if (state.cols.actual) out += '<td class="tp-r"><span class="tp-num">' + esc(fmt.acct(a) || '-') + '</span></td>';
    if (state.cols.budget) out += '<td class="tp-r"><span class="tp-num">' + esc(fmt.acct(b) || '-') + '</span></td>';
    if (state.cols.variance) {
      var tone = !isNum(v) ? 'tp-nil' : (v >= 0 ? 'tp-pos' : 'tp-neg');
      out += '<td class="tp-r"><span class="tp-num ' + tone + '">' + esc(fmt.signed(v) || '-') + '</span></td>';
    }
    if (state.cols.variancePct) {
      var ptone = !isNum(vp) ? 'tp-nil' : (vp >= 0 ? 'tp-pos' : 'tp-neg');
      out += '<td class="tp-r"><span class="tp-num ' + ptone + '">' + esc(fmt.signedPct(vp) || '-') + '</span></td>';
    }
    if (state.cols.pctRev) out += '<td class="tp-r"><span class="tp-num is-muted">-</span></td>';
    return out + '</tr>';
  }

  /* Click a line, see its 30-month trend. Impossible in the DAX-string version
     without emitting a second measure and a second visual. */
  function showTrend(key) {
    if (!view.panel || !view.pnlSeries) return;
    var series = view.pnlSeries[String(key)];
    var row = null, i;
    for (i = 0; i < view.pnlRows.length; i++) {
      if (String(view.pnlRows[i].key) === String(key)) row = view.pnlRows[i];
    }
    if (!series || !series.length || !row) { hideTrend(); return; }

    state.activeRow = key;
    var fmt = view.fmt;
    var W = 720, H = 92, padT = 10, padB = 18, padL = 4, padR = 4;
    var plotH = H - padT - padB, plotW = W - padL - padR;

    /* Two different extremes, and conflating them is a real bug. The PLOT
       domain is padded to include zero so the baseline is meaningful; the
       reported peak and trough must stay the actual observed values, or a
       revenue line that never goes near zero reports "Trough 0". */
    var dataLo = Infinity, dataHi = -Infinity;
    for (i = 0; i < series.length; i++) {
      var a = toMajor(series[i].a), b = toMajor(series[i].b);
      if (isNum(a)) { dataLo = Math.min(dataLo, a); dataHi = Math.max(dataHi, a); }
      if (isNum(b)) { dataLo = Math.min(dataLo, b); dataHi = Math.max(dataHi, b); }
    }
    if (!isFinite(dataLo)) { hideTrend(); return; }
    var lo = Math.min(dataLo, 0), hi = Math.max(dataHi, 0);
    if (hi === lo) hi = lo + 1;
    var step = series.length > 1 ? plotW / (series.length - 1) : 0;
    function yv(v) { return padT + plotH - ((v - lo) / (hi - lo)) * plotH; }

    var aPts = [], bPts = [], dots = '';
    for (i = 0; i < series.length; i++) {
      var x = padL + i * step;
      var av = toMajor(series[i].a), bv = toMajor(series[i].b);
      if (isNum(av)) aPts.push(x.toFixed(1) + ',' + yv(av).toFixed(1));
      if (isNum(bv)) bPts.push(x.toFixed(1) + ',' + yv(bv).toFixed(1));
    }
    var last = series[series.length - 1];
    var lastA = toMajor(last.a);
    if (isNum(lastA)) {
      dots = '<circle cx="' + (padL + (series.length - 1) * step).toFixed(1) + '" cy="' +
        yv(lastA).toFixed(1) + '" r="3" fill="var(--tp-accent)"/>';
    }
    var zeroY = yv(0);

    view.panel.innerHTML =
      '<div class="tp-panel-head">' +
      '<span class="tp-panel-t">' + esc(row.label) + '</span>' +
      '<span class="tp-lab">' + series.length + ' months' + '</span>' +
      '<span class="tp-key" style="font-size:11.5px;color:var(--tp-faint)">' +
      '<span class="tp-sw" style="background:var(--tp-accent)"></span>Actual' +
      '<span class="tp-sw" style="background:var(--tp-faint);margin-left:10px"></span>Budget</span>' +
      '<button type="button" class="tp-panel-x" data-tp-act="trend-close">' + IC.close() + '</button>' +
      '</div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" ' +
      'style="width:100%;height:56px" role="img" aria-label="Monthly trend for ' + esc(row.label) + '">' +
      '<line x1="' + padL + '" y1="' + zeroY.toFixed(1) + '" x2="' + (W - padR) +
      '" y2="' + zeroY.toFixed(1) + '" stroke="var(--tp-line)" stroke-width="1"/>' +
      (bPts.length ? '<polyline points="' + bPts.join(' ') + '" fill="none" ' +
        'stroke="var(--tp-faint)" stroke-width="1.4" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>' : '') +
      (aPts.length ? '<polyline points="' + aPts.join(' ') + '" fill="none" ' +
        'stroke="var(--tp-accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>' : '') +
      dots +
      '</svg>' +
      '<div style="display:flex;gap:16px;margin-top:5px;font-size:11.5px;color:var(--tp-muted)">' +
      '<span>Latest <b style="color:var(--tp-ink)">' + esc(fmt.acct(lastA) || '-') + '</b></span>' +
      '<span>Peak <b style="color:var(--tp-ink)">' + esc(fmt.acct(dataHi) || '-') + '</b></span>' +
      '<span>Trough <b style="color:var(--tp-ink)">' + esc(fmt.acct(dataLo) || '-') + '</b></span>' +
      '</div>';
    view.panel.classList.add('is-on');
  }

  function hideTrend() {
    state.activeRow = null;
    if (view.panel) { view.panel.classList.remove('is-on'); view.panel.innerHTML = ''; }
  }

  /* =========================================================================
   * 5. PARETO
   * ====================================================================== */

  var MEASURES = [
    { key: 'revenue', label: 'Revenue', money: true },
    { key: 'units', label: 'Units', money: false },
    { key: 'margin', label: 'Margin', money: true }
  ];
  var TOPN = [
    { v: 20, label: 'Top 20' },
    { v: 50, label: 'Top 50' },
    { v: 0, label: 'All' }
  ];
  var CAT_COLORS = ['#2d6a4f', '#1d4ed8', '#b45309', '#7c3aed', '#be123c', '#0e7490', '#4d7c0f', '#a16207'];

  function renderPareto(data, fmt) {
    var p = data.pareto || {};
    var all = (p.products || []).slice();
    var shell = buildCard(data.meta || {});
    if (!all.length) {
      shell.body.appendChild(emptyState('No product sales',
        'No products matched the current selection.'));
      return shell.card;
    }

    var mkey = state.measure;
    var mdef = MEASURES[0];
    for (var mi = 0; mi < MEASURES.length; mi++) if (MEASURES[mi].key === mkey) mdef = MEASURES[mi];

    /* Rank, cumulate, find the threshold crossing. All of this was O(n^2) DAX
       ([Product Rank], [Cumulative Revenue], [Cumulative Revenue %]) evaluated
       once per product per CONCATENATEX pass. Here it is one sort and one
       linear scan. */
    var items = [];
    for (var i = 0; i < all.length; i++) {
      var raw = all[i][mkey];
      var v = mdef.money ? toMajor(raw) : (isNum(raw) ? raw : null);
      if (!isNum(v) || v <= 0) continue;
      items.push({
        key: all[i].key, sku: all[i].sku, name: all[i].name,
        category: all[i].category || 'Uncategorised', value: v,
        revenue: toMajor(all[i].revenue), units: all[i].units,
        margin: toMajor(all[i].margin)
      });
    }
    if (!items.length) {
      shell.body.appendChild(emptyState('No positive ' + mdef.label.toLowerCase(),
        'Every product returned blank or zero for this measure.'));
      return shell.card;
    }
    /* Tie-break on key so the cumulative line never desyncs, exactly the rule
       the original [Product Rank] encoded with its ProductKey/1e9 nudge. */
    items.sort(function (a, b) { return b.value - a.value || a.key - b.key; });

    var total = 0;
    for (i = 0; i < items.length; i++) total += items[i].value;
    var cum = 0, thresholdIdx = items.length;
    for (i = 0; i < items.length; i++) {
      cum += items[i].value;
      items[i].rank = i + 1;
      items[i].cum = cum;
      items[i].cumPct = cum / total;
      items[i].share = items[i].value / total;
      if (items[i].cumPct >= state.threshold && thresholdIdx === items.length) {
        thresholdIdx = i + 1;
      }
    }

    var cats = [];
    for (i = 0; i < items.length; i++) {
      if (cats.indexOf(items[i].category) === -1) cats.push(items[i].category);
    }
    cats.sort();

    var shown = state.topN > 0 ? items.slice(0, Math.min(state.topN, items.length)) : items;

    /* toolbar */
    var bar = el('div', 'tp-bar');
    bar.appendChild(el('span', 'tp-lab', 'Measure'));
    for (i = 0; i < MEASURES.length; i++) {
      bar.appendChild(chip(MEASURES[i].label, 'pareto-measure', MEASURES[i].key,
        MEASURES[i].key === state.measure));
    }
    bar.appendChild(el('span', 'tp-lab', 'Show'));
    for (i = 0; i < TOPN.length; i++) {
      bar.appendChild(chip(TOPN[i].label, 'pareto-topn', TOPN[i].v, TOPN[i].v === state.topN));
    }
    bar.appendChild(chip('Colour by category', 'pareto-colorby', 'category',
      state.colorBy === 'category'));

    var slot = el('span', 'tp-key');
    slot.style.gap = '7px';
    slot.appendChild(el('span', 'tp-lab', 'Threshold'));
    var range = el('input');
    range.type = 'range';
    range.className = 'tp-range';
    range.min = '50'; range.max = '99'; range.step = '1';
    range.value = String(Math.round(state.threshold * 100));
    range.id = 'tp-threshold';
    range.setAttribute('aria-label', 'Pareto threshold percentage');
    slot.appendChild(range);
    var rlab = el('span', 'tp-pill', Math.round(state.threshold * 100) + '%');
    rlab.id = 'tp-threshold-label';
    slot.appendChild(rlab);
    bar.appendChild(slot);
    shell.body.appendChild(bar);

    var insight = el('div', 'tp-bar');
    var pillTxt = thresholdIdx + ' of ' + items.length + ' products drive ' +
      fmt.pct(state.threshold, 0) + ' of ' + mdef.label.toLowerCase();
    var ip = el('span', 'tp-pill', esc(pillTxt));
    ip.id = 'tp-insight';
    insight.appendChild(ip);
    insight.appendChild(el('span', 'tp-lab',
      (thresholdIdx / items.length * 100).toFixed(1) + '% of the catalogue'));
    shell.body.appendChild(insight);

    /* chart */
    var chart = el('div', 'tp-chart');
    chart.innerHTML = paretoSvg(shown, items.length, total, mdef, fmt, cats);
    var tip = el('div', 'tp-tip');
    chart.appendChild(tip);
    shell.body.appendChild(chart);
    view.tip = tip;
    view.chart = chart;
    view.paretoItems = items;
    view.paretoShown = shown;
    view.paretoMeasure = mdef;
    view.paretoCats = cats;
    view.fmt = fmt;

    var legend = el('div', 'tp-legend');
    if (state.colorBy === 'category') {
      var lh = '';
      for (i = 0; i < cats.length; i++) {
        lh += '<span class="tp-key"><span class="tp-sw" style="background:' +
          CAT_COLORS[i % CAT_COLORS.length] + '"></span>' + esc(cats[i]) + '</span>';
      }
      legend.innerHTML = lh;
    } else {
      legend.innerHTML =
        '<span class="tp-key"><span class="tp-sw" style="background:var(--tp-accent)"></span>' +
        'Inside the ' + fmt.pct(state.threshold, 0) + ' band (the vital few)</span>' +
        '<span class="tp-key"><span class="tp-sw" style="background:var(--tp-line-2)"></span>The useful many</span>' +
        '<span class="tp-key"><span class="tp-sw" style="background:var(--tp-amber)"></span>Cumulative share</span>';
    }
    shell.body.appendChild(legend);
    return shell.card;
  }

  function paretoSvg(shown, totalCount, total, mdef, fmt, cats) {
    var W = 1000, H = 400;
    var n = shown.length;
    /* Label gutter only needs to exist when labels are actually legible. */
    var showLabels = n <= 28;
    var padL = 66, padR = 52, padT = 16, padB = showLabels ? 86 : 30;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var step = plotW / n;
    var barW = Math.max(1, step * (n > 60 ? 0.86 : 0.68));
    var dataMax = 0, i;
    for (i = 0; i < n; i++) dataMax = Math.max(dataMax, shown[i].value);
    /* Scale bars to a round number so the left axis reads 1.2M / 900K / 600K
       rather than 1.2M / 896K / 598K. */
    var maxV = niceCeil(dataMax);

    var out = ['<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" ' +
      'role="img" aria-label="Pareto chart of ' + esc(mdef.label) + ' by product">'];

    /* gridlines + right axis (cumulative %) + left axis (value) */
    var g;
    for (g = 0; g <= 4; g++) {
      var frac = g / 4;
      var gy = padT + (1 - frac) * plotH;
      out.push('<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - padR) +
        '" y2="' + gy.toFixed(1) + '" stroke="var(--tp-grid)" stroke-width="1"/>');
      out.push('<text x="' + (W - padR + 8) + '" y="' + (gy + 4).toFixed(1) +
        '" font-size="12" fill="var(--tp-faint)">' + esc(fmt.pct(frac, 0)) + '</text>');
      out.push('<text x="' + (padL - 8) + '" y="' + (gy + 4).toFixed(1) +
        '" font-size="12" fill="var(--tp-faint)" text-anchor="end">' +
        esc(mdef.money ? fmt.compact(maxV * frac) : fmt.compact(maxV * frac)) + '</text>');
    }

    /* bars */
    for (i = 0; i < n; i++) {
      var it = shown[i];
      var x = padL + i * step + (step - barW) / 2;
      var bh = (it.value / maxV) * plotH;
      var y = padT + plotH - bh;
      var fill;
      if (state.colorBy === 'category') {
        fill = CAT_COLORS[Math.max(0, cats.indexOf(it.category)) % CAT_COLORS.length];
      } else {
        fill = it.cumPct <= state.threshold ? 'var(--tp-accent)' : 'var(--tp-line-2)';
      }
      out.push('<g class="tp-bar-g" tabindex="0" role="button" data-tp-bar="' + i + '" ' +
        'aria-label="' + esc(it.rank + '. ' + it.name + ', ' +
          (mdef.money ? fmt.money(it.value) : fmt.num(it.value)) + ', cumulative ' +
          fmt.pct(it.cumPct)) + '">');
      out.push('<rect class="tp-hit" x="' + x.toFixed(1) + '" y="' + padT + '" width="' +
        barW.toFixed(1) + '" height="' + plotH.toFixed(1) + '" fill="transparent" rx="2"/>');
      out.push('<rect class="tp-bar" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' +
        barW.toFixed(1) + '" height="' + Math.max(0.5, bh).toFixed(1) + '" rx="' +
        (barW > 6 ? 3 : 1) + '" fill="' + fill + '"/>');
      out.push('</g>');

      if (showLabels) {
        var cx = x + barW / 2;
        var ly = padT + plotH + 14;
        out.push('<text x="' + cx.toFixed(1) + '" y="' + ly + '" transform="rotate(-38 ' +
          cx.toFixed(1) + ' ' + ly + ')" text-anchor="end" font-size="12" ' +
          'fill="var(--tp-muted)">' + esc(clip(it.name, 16)) + '</text>');
      }
    }

    /* cumulative line, drawn across the shown window */
    var pts = [];
    for (i = 0; i < n; i++) {
      var lx = padL + i * step + step / 2;
      var ly2 = padT + (1 - shown[i].cumPct) * plotH;
      pts.push(lx.toFixed(1) + ',' + ly2.toFixed(1));
    }
    /* threshold rule sits at (1 - threshold) of the plot height */
    var ty = padT + (1 - state.threshold) * plotH;
    out.push('<line x1="' + padL + '" y1="' + ty.toFixed(1) + '" x2="' + (W - padR) +
      '" y2="' + ty.toFixed(1) + '" stroke="var(--tp-amber)" stroke-width="1.4" ' +
      'stroke-dasharray="6 4"/>');
    out.push('<polyline class="tp-cum" points="' + pts.join(' ') + '" fill="none" ' +
      'stroke="var(--tp-amber)" stroke-width="2.2" vector-effect="non-scaling-stroke"/>');

    /* dots, thinned so 120 products do not turn into a smear */
    var every = n <= 20 ? 1 : n <= 50 ? 3 : Math.ceil(n / 24);
    for (i = 0; i < n; i++) {
      if (i !== 0 && i !== n - 1 && (i + 1) % every !== 0) continue;
      var dx = padL + i * step + step / 2;
      var dy = padT + (1 - shown[i].cumPct) * plotH;
      out.push('<circle cx="' + dx.toFixed(1) + '" cy="' + dy.toFixed(1) +
        '" r="3" fill="var(--tp-amber)"/>');
      /* Skip the first label on a dense chart: the curve is near-vertical there
         and the text lands on top of its own line. */
      var wantLabel = (i === n - 1) || (n <= 20 && ((i + 1) % 5 === 0 || i === 0));
      if (wantLabel) {
        /* The first and last labels would otherwise hang over the axes, so
           anchor them inward instead of centring. */
        var anchor = i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle');
        out.push('<text x="' + dx.toFixed(1) + '" y="' + (dy - 9).toFixed(1) +
          '" text-anchor="' + anchor + '" font-size="11.5" fill="var(--tp-amber-ink)">' +
          esc(fmt.pct(shown[i].cumPct, 0)) + '</text>');
      }
    }

    if (!showLabels) {
      out.push('<text x="' + (padL + plotW / 2) + '" y="' + (padT + plotH + 20) +
        '" text-anchor="middle" font-size="12" fill="var(--tp-faint)">' +
        'Products ranked by ' + esc(mdef.label.toLowerCase()) + ', highest first (' +
        n + ' shown)</text>');
    }

    out.push('</svg>');
    return out.join('');
  }

  /* Round a maximum up to a human-looking value so quartered axis ticks land on
     numbers someone would have chosen. The ladder is deliberately fine: a
     coarse 1/2/5 ladder turns a 1.195M maximum into a 2M axis and throws away
     40% of the plot height. Every step here also divides into quarters
     cleanly, which is what the four gridlines need. */
  var NICE = [1, 1.2, 1.4, 1.5, 1.6, 1.8, 2, 2.4, 2.5, 3, 3.2, 4, 5, 6, 8, 10];
  function niceCeil(v) {
    if (!isNum(v) || v <= 0) return 1;
    var mag = Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
    var norm = v / mag;
    for (var i = 0; i < NICE.length; i++) {
      if (norm <= NICE[i] + 1e-9) return NICE[i] * mag;
    }
    return 10 * mag;
  }

  function clip(s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n - 1) + String.fromCharCode(0x2026) : s;
  }

  /* =========================================================================
   * 6. KPI CARDS
   * ====================================================================== */

  function renderKpis(data, fmt) {
    var list = data.kpis || [];
    var root = el('div', 'tp-root-inner');
    if (!list.length) return emptyState('No KPIs', 'The measure returned no cards.');
    var grid = el('div', 'tp-kpis');
    for (var i = 0; i < list.length; i++) grid.appendChild(kpiCard(list[i], fmt));
    root.appendChild(grid);
    root.style.height = '100%';
    return root;
  }

  function kpiCard(k, fmt) {
    var c = el('div', 'tp-kpi');
    var v;
    if (k.format === 'pct') v = fmt.pct(isNum(k.value) ? k.value / 10000 : null);
    else if (k.format === 'num') v = fmt.num(k.value);
    else if (k.format === 'text') v = k.value;
    else v = fmt.money(toMajor(k.value));

    var d = '';
    if (isNum(k.delta)) {
      var dv = k.deltaFormat === 'pct' ? fmt.signedPct(k.delta / 10000) : fmt.signed(toMajor(k.delta));
      var good = k.tone === 'inverse' ? k.delta <= 0 : k.delta >= 0;
      d = '<div class="tp-kpi-d ' + (good ? 'tp-pos' : 'tp-neg') + '">' + esc(dv || '') +
        (k.deltaLabel ? ' <span style="color:var(--tp-faint);font-weight:400">' +
          esc(k.deltaLabel) + '</span>' : '') + '</div>';
    }

    c.innerHTML = '<div><div class="tp-kpi-l">' + esc(k.label || '') + '</div>' +
      '<div class="tp-kpi-v">' + esc(v == null ? '-' : v) + '</div>' + d + '</div>';

    if (k.spark && k.spark.length > 1) {
      var s = el('div', 'tp-kpi-s');
      s.innerHTML = sparkSvg(k.spark, k.tone === 'inverse');
      c.appendChild(s);
    }
    return c;
  }

  function sparkSvg(vals, inverse) {
    var W = 200, H = 40, pad = 3;
    var lo = Infinity, hi = -Infinity, i;
    for (i = 0; i < vals.length; i++) {
      if (!isNum(vals[i])) continue;
      lo = Math.min(lo, vals[i]); hi = Math.max(hi, vals[i]);
    }
    if (!isFinite(lo)) return '';
    if (hi === lo) hi = lo + 1;
    var step = (W - pad * 2) / (vals.length - 1);
    var pts = [], area = [];
    for (i = 0; i < vals.length; i++) {
      if (!isNum(vals[i])) continue;
      var x = pad + i * step;
      var y = pad + (H - pad * 2) * (1 - (vals[i] - lo) / (hi - lo));
      pts.push(x.toFixed(1) + ',' + y.toFixed(1));
      area.push(x.toFixed(1) + ',' + y.toFixed(1));
    }
    if (pts.length < 2) return '';
    var rising = vals[vals.length - 1] >= vals[0];
    var good = inverse ? !rising : rising;
    var colour = good ? 'var(--tp-pos)' : 'var(--tp-neg)';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<polyline points="' + area.join(' ') + ' ' + (W - pad) + ',' + (H - pad) + ' ' +
      pad + ',' + (H - pad) + '" fill="' + colour + '" opacity="0.10" stroke="none"/>' +
      '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + colour +
      '" stroke-width="1.8" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>' +
      '</svg>';
  }

  /* =========================================================================
   * 7. EVENTS
   * All listeners are delegated onto the root, so they are discarded with the
   * DOM the host replaces rather than leaking on every cross-filter.
   * ====================================================================== */

  function closest(node, sel) {
    var n = node;
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
      var b = closest(e.target, '[data-tp-act]');
      if (!b) {
        var rowEl = closest(e.target, '[data-tp-series]');
        if (rowEl) {
          var rk = rowEl.getAttribute('data-tp-row');
          if (String(state.activeRow) === String(rk)) hideTrend(); else showTrend(rk);
        }
        return;
      }
      var act = b.getAttribute('data-tp-act');
      var val = b.getAttribute('data-tp-val');

      if (act === 'pnl-col') {
        /* never let the user hide every numeric column */
        var on = 0;
        for (var c in state.cols) if (state.cols[c]) on++;
        if (state.cols[val] && on <= 1) return;
        state.cols[val] = !state.cols[val];
        schedule();
      } else if (act === 'pnl-toggle') {
        state.openRows[val] = !state.openRows[val];
        schedule();
      } else if (act === 'trend-close') {
        hideTrend();
      } else if (act === 'pareto-measure') {
        state.measure = val;
        schedule();
      } else if (act === 'pareto-topn') {
        state.topN = parseInt(val, 10) || 0;
        schedule();
      } else if (act === 'pareto-colorby') {
        state.colorBy = state.colorBy === 'category' ? 'pareto' : 'category';
        schedule();
      }
    });

    root.addEventListener('keydown', function (e) {
      var t = closest(e.target, '[data-tp-act="pnl-toggle"]');
      if (t && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        state.openRows[t.getAttribute('data-tp-val')] = !state.openRows[t.getAttribute('data-tp-val')];
        schedule();
        return;
      }
      var bar = closest(e.target, '[data-tp-bar]');
      if (bar && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        showBarTip(bar, null);
      }
    });

    /* Threshold slider: recolour and recompute live, without a full re-render,
       so dragging stays smooth. */
    root.addEventListener('input', function (e) {
      if (!e.target || e.target.id !== 'tp-threshold') return;
      state.threshold = (parseInt(e.target.value, 10) || 80) / 100;
      applyThreshold();
    });
    root.addEventListener('change', function (e) {
      if (!e.target || e.target.id !== 'tp-threshold') return;
      schedule();
    });

    root.addEventListener('mousemove', function (e) {
      var bar = closest(e.target, '[data-tp-bar]');
      if (!bar) { if (view.tip) view.tip.classList.remove('is-on'); return; }
      showBarTip(bar, e);
    });
    root.addEventListener('mouseleave', function () {
      if (view.tip) view.tip.classList.remove('is-on');
    });
    root.addEventListener('focusin', function (e) {
      var bar = closest(e.target, '[data-tp-bar]');
      if (bar) showBarTip(bar, null);
    });
  }

  function applyThreshold() {
    var lab = document.getElementById('tp-threshold-label');
    if (lab) lab.textContent = Math.round(state.threshold * 100) + '%';
    if (!view.paretoItems || !view.chart) return;

    var items = view.paretoItems, i, idx = items.length;
    for (i = 0; i < items.length; i++) {
      if (items[i].cumPct >= state.threshold) { idx = i + 1; break; }
    }
    var ins = document.getElementById('tp-insight');
    if (ins && view.fmt && view.paretoMeasure) {
      ins.textContent = idx + ' of ' + items.length + ' products drive ' +
        view.fmt.pct(state.threshold, 0) + ' of ' + view.paretoMeasure.label.toLowerCase();
    }
    if (state.colorBy !== 'category') {
      var bars = view.chart.querySelectorAll('[data-tp-bar]');
      for (i = 0; i < bars.length; i++) {
        var it = view.paretoShown[parseInt(bars[i].getAttribute('data-tp-bar'), 10)];
        if (!it) continue;
        var rect = bars[i].querySelector('rect.tp-bar');
        if (rect) {
          rect.setAttribute('fill', it.cumPct <= state.threshold
            ? 'var(--tp-accent)' : 'var(--tp-line-2)');
        }
      }
    }
    var rule = view.chart.querySelector('svg line[stroke-dasharray]');
    if (rule) {
      var svg = view.chart.querySelector('svg');
      var vb = (svg.getAttribute('viewBox') || '0 0 1000 400').split(/\s+/);
      var H = parseFloat(vb[3]) || 400;
      var showLabels = view.paretoShown.length <= 28;
      var padT = 16, padB = showLabels ? 86 : 30;
      var plotH = H - padT - padB;
      var ty = padT + (1 - state.threshold) * plotH;
      rule.setAttribute('y1', ty.toFixed(1));
      rule.setAttribute('y2', ty.toFixed(1));
    }
  }

  function showBarTip(barEl, e) {
    if (!view.tip || !view.chart || !view.paretoShown) return;
    var it = view.paretoShown[parseInt(barEl.getAttribute('data-tp-bar'), 10)];
    if (!it) return;
    var fmt = view.fmt;
    view.tip.innerHTML =
      '<b>' + esc(it.rank + '. ' + it.name) + '</b><br>' +
      '<i>' + esc(it.sku) + ' ' + String.fromCharCode(0xB7) + ' ' + esc(it.category) + '</i><br>' +
      esc(view.paretoMeasure.label) + ' <b>' +
      esc(view.paretoMeasure.money ? fmt.money(it.value) : fmt.num(it.value)) + '</b> ' +
      '<i>(' + esc(fmt.pct(it.share)) + ' share)</i><br>' +
      'Cumulative <b>' + esc(fmt.pct(it.cumPct)) + '</b>';
    view.tip.classList.add('is-on');

    var cr = view.chart.getBoundingClientRect();
    var br = barEl.getBoundingClientRect();
    var x = br.left + br.width / 2 - cr.left;
    var y = (e ? e.clientY : br.top + 20) - cr.top - 12;
    var tw = view.tip.offsetWidth, th = view.tip.offsetHeight;
    if (x < tw / 2 + 6) x = tw / 2 + 6;
    if (x > cr.width - tw / 2 - 6) x = cr.width - tw / 2 - 6;
    if (y < th + 6) y = th + 6;
    view.tip.style.left = Math.round(x) + 'px';
    view.tip.style.top = Math.round(y) + 'px';
  }

  /* =========================================================================
   * 8. RENDER + BOOT
   * ====================================================================== */

  function ensureStyles() {
    if (document.getElementById('tp-css')) return;
    var st = document.createElement('style');
    st.id = 'tp-css';
    st.appendChild(document.createTextNode(CSS));
    (document.head || document.documentElement).appendChild(st);
  }

  function ensureContainer() {
    var c = document.getElementById('tp-root') || document.querySelector('[data-tp-root]');
    if (!c) {
      c = document.createElement('div');
      c.id = 'tp-root';
      (document.body || document.documentElement).appendChild(c);
    }
    return c;
  }

  function render() {
    var root = ensureContainer();
    ensureStyles();
    view = {};
    root.className = 'tp-root';
    root.innerHTML = '';

    var data = readData();
    if (!data) {
      root.appendChild(emptyState('Waiting for data',
        'window.__tpData was not set. Check the measure is on the visual.'));
      return;
    }
    var fmt = makeFmt(data.locale, data.currency);
    var page = data.page || (data.pnl ? 'pnl' : data.pareto ? 'pareto' : data.kpis ? 'kpi' : null);

    var node;
    if (page === 'pnl') node = renderPnl(data, fmt);
    else if (page === 'pareto') node = renderPareto(data, fmt);
    else if (page === 'kpi') node = renderKpis(data, fmt);
    else node = emptyState('Unknown page', 'Set page to pnl, pareto or kpi.');

    root.appendChild(node);

    /* Wire ONCE per root element, not once per render.
       render() empties and refills #tp-root but does not replace the element
       itself, so calling wire() unconditionally stacks a fresh set of listeners
       on every internal re-render. Two listeners means a toggle fires twice and
       nets to no change, which looks exactly like "the button stopped working".
       When the host replaces the DOM on a cross-filter, #tp-root is a brand new
       element without the flag, so it gets wired again as intended. */
    if (root.__tpWired !== VERSION) {
      wire(root);
      root.__tpWired = VERSION;
    }

    /* Let the first paint land before enabling geometry transitions, otherwise
       every bar animates in from zero on a plain cross-filter. */
    var chart = root.querySelector('.tp-chart');
    if (chart && typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { chart.classList.add('tp-anim'); });
      });
    }
  }

  var pending = false, bootTries = 0, bootTimer = null, rendered = false;

  function schedule() {
    if (pending) return;
    pending = true;
    var run = function () {
      pending = false;
      try { render(); rendered = true; } catch (err) { fallback(err); }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else window.setTimeout(run, 0);
  }

  function boot() {
    if (bootTimer) { window.clearTimeout(bootTimer); bootTimer = null; }
    bootTries = 0;
    attempt();
  }

  function attempt() {
    if (!document.body) {
      if (bootTries++ < 200) bootTimer = window.setTimeout(attempt, 16);
      return;
    }
    if (!window.__tpData && !rendered && bootTries < 12 && document.readyState !== 'complete') {
      bootTries++;
      bootTimer = window.setTimeout(attempt, 24);
      return;
    }
    schedule();
  }

  function fallback(err) {
    try {
      var c = ensureContainer();
      c.innerHTML = '<div style="font:13px/1.6 Segoe UI,Arial,sans-serif;padding:18px;color:#dc2626">' +
        '<strong>TrailPeak visual failed to render.</strong><br>v' + VERSION + ' ' +
        String.fromCharCode(0xB7) + ' ' + esc(err && err.message ? err.message : String(err)) + '</div>';
      if (window.console && console.error) console.error('[tp]', err);
    } catch (e2) { /* nothing left to do */ }
  }

  window.TP = {
    __installed: VERSION,
    version: VERSION,
    boot: boot,
    render: schedule,
    state: state,
    /* exposed for the test harness so ranking maths can be asserted directly */
    _internals: { makeFmt: makeFmt, toMajor: toMajor }
  };

  boot();
})();
