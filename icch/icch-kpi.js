/*!
 * Inspired Closets Chicago - "KPI Overview" report page, rendered in JavaScript
 * ---------------------------------------------------------------------------
 * Repo    : https://github.com/sulaiman013/dax-with-js
 * Serve   : https://cdn.jsdelivr.net/gh/sulaiman013/dax-with-js@icch-kpi-v1.1.0/icch/icch-kpi.js
 * License : MIT
 *
 * Fourteen KPI tiles, NO goal framework (ICCH has not set goals): each tile
 * shows the current value, a prior-vs-current mini-bar pair, and a delta chip
 * against the DAY-MATCHED prior period (same period last year / prior month
 * through the same day / prior Sunday-week through the same weekday).
 *
 * DATA CONTRACT - window.__icchKpi  (every value an INTEGER, locale-safe)
 * ---------------------------------------------------------------------------
 *   asof 'YYYY-MM-DD' · doy/diy · dom/dim · wde (Sunday-week day count)
 *   s: 12-point spark series (oldest->newest): rev12/jobs12/fa12/leads12
 *      (monthly) + revw12/jobsw12/faw12 (weekly). Money series in DOLLARS.
 *   cur / pri, same keys each:
 *     revY/revM/revW  sold revenue, CENTS (by Original Project Sold Date -
 *                     the Salesforce Community standard)
 *     jobsY/jobsM/jobsW  sold project counts (same basis)
 *     faY/faW            FIRST appointments
 *     leadsY/leadsW      new leads
 *     desM               distinct designers with an opp created in the window
 *     soldM/cedM         Community closing inputs: sold-by-sold-date /
 *                        created excluding Dead Lead
 *
 * Derived here, never in DAX: closing % = soldM/cedM, average sale =
 * revM/jobsM, appts/designer = faW/desM, lead->appt = faW/leadsW (both
 * periods), every delta, every formatted string, every colour.
 *
 * Sandbox notes: HTML Content (standard) iframe; DOM replaced + scripts
 * re-run on every cross-filter/resize. Install guard, style-inject-once,
 * zero listeners, rAF-coalesced renders. Reset is box-sizing ONLY (an
 * `#id *{margin:0}` reset outranks class margins - learned on icla-goals).
 */
(function () {
  'use strict';

  if (window.ICCHKPI && window.ICCHKPI.__installed) {
    window.ICCHKPI.render();
    return;
  }

  /* ── report theme tokens (Inspired Closets LA theme, shared by this fork) ── */
  var T = {
    ink: '#1A1D2E', sec: '#5C5F77', faint: '#9497AD',
    line: '#E3E5F0', ground: '#F7F8FB', card: '#FFFFFF',
    cur: '#0FAF8E', prior: '#D5D8E4',
    goodTx: '#0B7A63', goodTk: '#DCF4EE',
    badTx: '#B02F2C', badTk: '#FBDFDD',
    naTx: '#5C5F77', naTk: '#EDEFF5'
  };

  var CSS = [
    'html,body{height:100%;margin:0}',
    '#ick-root{background:', T.ground, ';color:', T.ink,
      ";font-family:'Segoe UI',system-ui,-apple-system,sans-serif;",
      'padding:22px 24px 16px;height:100%;height:100vh;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden}',
    '#ick-root *{box-sizing:border-box}',
    '.ick-head{display:flex;align-items:baseline;justify-content:space-between;gap:14px;',
      'flex-wrap:wrap;border-bottom:3px solid ', T.cur, ';padding-bottom:14px;margin-bottom:18px}',
    '.ick-eyebrow{font-size:10.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:', T.cur, ';margin-bottom:2px}',
    '.ick-title{font-size:24px;font-weight:700;letter-spacing:-.01em}',
    '.ick-title span{color:', T.faint, ';font-weight:400}',
    '.ick-asof{text-align:right;color:', T.sec, ';font-size:11.5px;line-height:1.5}',
    '.ick-asof b{color:', T.ink, ';font-weight:600}',
    '.ick-sec{margin-bottom:16px;flex:1;display:flex;flex-direction:column;min-height:0}',
    '.ick-sechead{display:flex;align-items:center;gap:9px;margin-bottom:10px}',
    '.ick-tag{font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:', T.cur, '}',
    '.ick-win{font-size:11px;color:', T.faint, '}',
    '.ick-rule{flex:1;height:1px;background:', T.line, '}',
    '.ick-grid{flex:1;display:grid;grid-template-columns:repeat(5,1fr);grid-auto-rows:1fr;gap:14px;min-height:0}',
    '.ick-tile{background:', T.card, ';border:1px solid ', T.line, ';border-radius:10px;',
      'padding:13px 15px 13px;display:flex;flex-direction:column;gap:6px;min-width:0;overflow:hidden;position:relative}',
    '.ick-hero{grid-column:span 2}',
    '.ick-label{font-size:11px;font-weight:600;color:', T.sec, ';display:flex;align-items:center;justify-content:space-between;gap:6px}',
    '.ick-ico{flex:none;width:26px;height:26px;border-radius:8px;background:', T.goodTk, ';color:', T.goodTx, ';display:flex;align-items:center;justify-content:center}',
    '.ick-ico svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}',
    '.ick-spark{position:absolute;left:15px;right:15px;bottom:36px;height:24px;opacity:.5;pointer-events:none;z-index:0}',
    '.ick-spark svg{width:100%;height:100%;display:block}',
    '.ick-value{position:relative;z-index:1;margin-top:auto;font-size:clamp(22px,3.4vh,30px);font-weight:600;line-height:1.05;letter-spacing:-.01em;',
      "font-family:'Segoe UI',system-ui,sans-serif}",
    '.ick-hero .ick-value{font-size:clamp(30px,5vh,44px);font-weight:700}',
    '.ick-value small{font-size:.55em;color:', T.faint, ';font-weight:500}',
    '.ick-prev{font-size:11px;color:', T.sec, '}',
    '.ick-prev b{color:', T.ink, ';font-weight:600}',
    '.ick-bars{margin-top:auto;display:flex;flex-direction:column;gap:2px}',
    '.ick-bar{position:relative;height:7px;border-radius:4px;background:transparent}',
    '.ick-bar div{position:absolute;top:0;bottom:0;left:0;border-radius:4px;min-width:2px}',
    '.ick-foot{position:relative;z-index:1;display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:1px;min-height:20px}',
    '.ick-sub{font-size:10.5px;color:', T.faint, ';font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.ick-chip{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;',
      'padding:2px 8px;border-radius:999px;white-space:nowrap;flex:none}',
    '.ick-notes{flex:none;margin-top:2px;padding:12px 16px;background:', T.card, ';border:1px solid ', T.line,
      ';border-radius:8px;font-size:11px;color:', T.sec, ';line-height:1.65}',
    '.ick-notes b{color:', T.ink, '}',
    '@media(max-width:900px){.ick-grid{grid-template-columns:repeat(2,1fr)}}',
    /* compact mode for short iframes: chip already carries the delta */
    '@media(max-height:759px){.ick-bars,.ick-prev{display:none}.ick-spark{bottom:30px;height:18px}',
      '.ick-tile{padding:9px 12px;gap:3px}.ick-foot{min-height:18px}',
      '.ick-value{font-size:clamp(18px,3vh,24px)}',
      '.ick-hero .ick-value{font-size:clamp(24px,4.2vh,34px)}',
      '.ick-head{padding-bottom:8px;margin-bottom:10px}.ick-sec{margin-bottom:8px}',
      '.ick-notes{padding:8px 12px;font-size:10px;line-height:1.5}}'
  ].join('');

  /* ── formatting ─────────────────────────────────────────────────────────── */
  function money(cents) {
    var v = cents / 100;
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
    if (v >= 1e4) return '$' + Math.round(v / 1e3) + 'K';
    return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  function moneyFull(cents) {
    return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function num(n) { return Number(n).toLocaleString('en-US'); }

  function chipFor(cur, pri, kind) {
    if (kind !== 'pp' && pri != null && pri > 0 && pri < 30 && cur > pri * 5) {
      return '<span class="ick-chip" style="color:' + T.naTx + ';background:' + T.naTk + '">n/a</span>';
    }
    /* kind: 'pct-change' (default) or 'pp' for percent-point metrics */
    var col, glyph, txt;
    if (pri == null || (pri === 0 && cur === 0)) { col = [T.naTx, T.naTk]; txt = '—'; glyph = ''; }
    else if (kind === 'pp') {
      var d = cur - pri;
      glyph = d > 0.0001 ? '▲' : d < -0.0001 ? '▼' : '■';
      txt = (d >= 0 ? '+' : '') + (d * 100).toFixed(1) + ' pp';
      col = d > 0.0001 ? [T.goodTx, T.goodTk] : d < -0.0001 ? [T.badTx, T.badTk] : [T.naTx, T.naTk];
    } else if (pri === 0) { col = [T.goodTx, T.goodTk]; glyph = '▲'; txt = 'new'; }
    else {
      var p = (cur - pri) / pri;
      glyph = p > 0.0005 ? '▲' : p < -0.0005 ? '▼' : '■';
      txt = (p >= 0 ? '+' : '') + (p * 100).toFixed(1) + '%';
      col = p > 0.0005 ? [T.goodTx, T.goodTk] : p < -0.0005 ? [T.badTx, T.badTk] : [T.naTx, T.naTk];
    }
    return '<span class="ick-chip" style="color:' + col[0] + ';background:' + col[1] + '">' + glyph + ' ' + txt + '</span>';
  }


  var ICONS = {
    dollar: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/><path d="M10 5.5v9M12.6 7.4c-.5-.8-1.5-1.3-2.6-1.3-1.4 0-2.5.8-2.5 1.9 0 2.5 5 1.4 5 3.9 0 1.1-1.1 1.9-2.5 1.9-1.1 0-2.1-.5-2.6-1.3"/></svg>',
    tag: '<svg viewBox="0 0 20 20"><path d="M3 3h6l8 8-6 6-8-8z"/><circle cx="7" cy="7" r="1.4"/></svg>',
    cal: '<svg viewBox="0 0 20 20"><rect x="3" y="4.5" width="14" height="12" rx="2"/><path d="M3 8.5h14M7 3v3M13 3v3M7.6 12.4l1.7 1.7 3.1-3.6"/></svg>',
    userplus: '<svg viewBox="0 0 20 20"><circle cx="8" cy="7" r="2.8"/><path d="M3.2 16.5c.5-2.6 2.4-4.3 4.8-4.3s4.3 1.7 4.8 4.3M14.5 8h4M16.5 6v4"/></svg>',
    users: '<svg viewBox="0 0 20 20"><circle cx="7" cy="7.5" r="2.6"/><circle cx="13.5" cy="8.5" r="2.1"/><path d="M2.8 16.3c.4-2.4 2.1-4 4.2-4s3.8 1.6 4.2 4M12 12.9c1.9.2 3.4 1.6 3.8 3.4"/></svg>',
    pct: '<svg viewBox="0 0 20 20"><path d="M5.5 14.5l9-9"/><circle cx="6.6" cy="6.6" r="1.9"/><circle cx="13.4" cy="13.4" r="1.9"/></svg>',
    receipt: '<svg viewBox="0 0 20 20"><path d="M5.5 3h9v14l-1.8-1.3-1.6 1.3-1.6-1.3L7.9 17l-2.4-1.3z"/><path d="M8 7h4M8 10h4"/></svg>'
  };
  function spark(series) {
    if (!series || series.length < 2) return '';
    var n = series.length, mx = Math.max.apply(null, series), mn = Math.min.apply(null, series);
    if (mx === mn) mx = mn + 1;
    var pts = [];
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 96 + 2;
      var y = 24 - ((series[i] - mn) / (mx - mn)) * 20;
      pts.push(x.toFixed(1) + ',' + y.toFixed(1));
    }
    var last = pts[pts.length - 1].split(',');
    return '<div class="ick-spark"><svg viewBox="0 0 100 28" preserveAspectRatio="none">' +
      '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + T.cur + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.4" fill="' + T.cur + '" stroke="' + T.card + '" stroke-width="1.4"/>' +
      '</svg></div>';
  }

  function bars(cur, pri) {
    var mx = Math.max(cur, pri, 1);
    return '<div class="ick-bars">' +
      '<div class="ick-bar"><div style="width:' + (cur / mx * 100) + '%;background:' + T.cur + '"></div></div>' +
      '<div class="ick-bar"><div style="width:' + (pri / mx * 100) + '%;background:' + T.prior + '"></div></div>' +
      '</div>';
  }

  /* t: {label, hero, cur, pri, fmt:'money'|'count'|'pct'|'dec', sub, chipKind, titleAttr} */
  function tile(t) {
    var show = function (v) {
      if (v == null) return '–';
      if (t.fmt === 'money') return money(v);
      if (t.fmt === 'pct') return (v * 100).toFixed(1) + '%';
      if (t.fmt === 'dec') return v.toFixed(1);
      return num(v);
    };
    var prevTxt = t.pri == null ? 'no prior data'
      : 'prior: <b>' + show(t.pri) + '</b>';
    var barCur = t.fmt === 'pct' || t.fmt === 'dec' ? (t.cur || 0) * 1000 : (t.cur || 0);
    var barPri = t.fmt === 'pct' || t.fmt === 'dec' ? (t.pri || 0) * 1000 : (t.pri || 0);
    var ico = t.icon ? '<span class="ick-ico">' + ICONS[t.icon] + '</span>' : '';
    var mid = t.series ? spark(t.series) : bars(barCur, barPri);
    return '<div class="ick-tile' + (t.hero ? ' ick-hero' : '') + '"' +
      (t.titleAttr ? ' title="' + t.titleAttr + '"' : '') + '>' +
      '<div class="ick-label"><span>' + t.label + '</span>' + ico + '</div>' +
      '<div class="ick-value">' + show(t.cur) + '</div>' +
      '<div class="ick-prev">' + prevTxt + '</div>' +
      mid +
      '<div class="ick-foot"><span class="ick-sub">' + (t.sub || '') + '</span>' +
      chipFor(t.cur || 0, t.pri, t.chipKind) + '</div></div>';
  }

  function section(tag, win, tiles) {
    var cells = '';
    for (var i = 0; i < tiles.length; i++) cells += tile(tiles[i]);
    return '<div class="ick-sec"><div class="ick-sechead">' +
      '<span class="ick-tag">' + tag + '</span><span class="ick-win">' + win + '</span>' +
      '<div class="ick-rule"></div></div><div class="ick-grid">' + cells + '</div></div>';
  }

  function build(d) {
    var c = d.cur || {}, p = d.pri || {};
    var sr = d.s || {};
    var mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var parts = String(d.asof || '').split('-');
    var asofNice = parts.length === 3
      ? mons[(+parts[1] || 1) - 1] + ' ' + (+parts[2]) + ', ' + parts[0] : String(d.asof || '');

    function ratio(a, b) { return b ? a / b : null; }
    var closeC = ratio(c.soldM, c.cedM), closeP = ratio(p.soldM, p.cedM);
    var avgC = c.jobsM ? Math.round(c.revM / c.jobsM) : null;
    var avgP = p.jobsM ? Math.round(p.revM / p.jobsM) : null;
    var apdC = c.desM ? c.faW / c.desM : null, apdP = p.desM ? p.faW / p.desM : null;
    var l2aC = ratio(c.faW, c.leadsW), l2aP = ratio(p.faW, p.leadsW);

    var year = section('This year', 'Jan 1 – ' + asofNice + ' · vs same period last year', [
      { hero: 1, label: 'Sold revenue', fmt: 'money', cur: c.revY, pri: p.revY, titleAttr: moneyFull(c.revY || 0), icon: 'dollar', series: sr.rev12 },
      { label: 'Jobs sold', fmt: 'count', cur: c.jobsY, pri: p.jobsY, icon: 'tag', series: sr.jobs12 },
      { label: 'Appointments (first)', fmt: 'count', cur: c.faY, pri: p.faY,
        sub: c.faY > (p.faY || 0) * 5 && (p.faY || 0) < 30 ? 'first-appt flag adopted mid-2025' : '', icon: 'cal', series: sr.fa12 },
      { label: 'New leads', fmt: 'count', cur: c.leadsY, pri: p.leadsY, icon: 'userplus', series: sr.leads12 }
    ]);
    var month = section('This month', 'Day ' + d.dom + ' of ' + d.dim + ' · vs prior month, day-matched', [
      { label: 'Revenue', fmt: 'money', cur: c.revM, pri: p.revM, titleAttr: moneyFull(c.revM || 0), icon: 'dollar', series: sr.revw12 },
      { label: 'Jobs sold', fmt: 'count', cur: c.jobsM, pri: p.jobsM, icon: 'tag', series: sr.jobsw12 },
      { label: 'Sales designers', fmt: 'count', cur: c.desM, pri: p.desM, sub: 'active this month', icon: 'users' },
      { label: 'Company closing %', fmt: 'pct', cur: closeC, pri: closeP, chipKind: 'pp', icon: 'pct',
        sub: num(c.soldM || 0) + ' sold ÷ ' + num(c.cedM || 0) + ' created' },
      { label: 'Average sale', fmt: 'money', cur: avgC, pri: avgP, icon: 'receipt',
        titleAttr: avgC == null ? '' : moneyFull(avgC) }
    ]);
    var week = section('This week', 'Sunday start · day ' + d.wde + ' of 7 · vs prior week, day-matched', [
      { label: 'Revenue', fmt: 'money', cur: c.revW, pri: p.revW, titleAttr: moneyFull(c.revW || 0), icon: 'dollar', series: sr.revw12 },
      { label: 'Jobs sold', fmt: 'count', cur: c.jobsW, pri: p.jobsW, icon: 'tag', series: sr.jobsw12 },
      { label: 'Appointments (first)', fmt: 'count', cur: c.faW, pri: p.faW, icon: 'cal', series: sr.faw12 },
      { label: 'Appts per designer', fmt: 'dec', cur: apdC, pri: apdP, icon: 'users',
        sub: num(c.faW || 0) + ' first appts ÷ ' + num(c.desM || 0) + ' designers' },
      { label: 'Lead → appt conversion', fmt: 'pct', cur: l2aC, pri: l2aP, chipKind: 'pp', icon: 'pct',
        sub: num(c.faW || 0) + ' of ' + num(c.leadsW || 0) + ' leads · partial week' }
    ]);

    return '<div class="ick-head"><div>' +
      '<div class="ick-eyebrow">Inspired Closets · Chicago</div>' +
      '<div class="ick-title">KPI Overview <span>· current vs prior period</span></div></div>' +
      '<div class="ick-asof">Data as of <b>' + asofNice + '</b><br>' +
      'Basis: sold date (Salesforce Community standard) · week starts Sunday</div></div>' +
      year + month + week +
      '<div class="ick-notes"><b>Definitions.</b> Sold $ and jobs count by Original Project Sold Date, matching the Salesforce Community. ' +
      'Closing % = sold in period ÷ created in period, excluding Dead Lead (Community formula). ' +
      'Average sale = sold $ ÷ jobs sold. Appointments = first appointments; leads and appointments count by their own dates. ' +
      'Green bar = this period, gray bar = prior period (day-matched: same elapsed days).</div>';
  }

  /* ── idempotent plumbing ───────────────────────────────────────────────── */
  var queued = false;
  function render() {
    if (queued) return;
    queued = true;
    (window.requestAnimationFrame || window.setTimeout)(function () {
      queued = false;
      var root = document.getElementById('ick-root');
      if (!root) return;
      if (!document.getElementById('ick-style')) {
        var s = document.createElement('style');
        s.id = 'ick-style';
        s.textContent = CSS;
        document.head.appendChild(s);
      }
      var d = window.__icchKpi;
      root.innerHTML = d ? build(d)
        : '<div style="padding:24px;color:' + T.faint + ';font-family:Segoe UI,sans-serif">Waiting for data…</div>';
    });
  }

  window.ICCHKPI = { __installed: true, render: render, version: 'icch-kpi-v1.1.0' };
  render();
})();
