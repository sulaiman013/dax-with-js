/*!
 * Salesforce Sales & Marketing Demo - "KPI Overview" report page, rendered in JavaScript
 * ---------------------------------------------------------------------------
 * Repo    : https://github.com/sulaiman013/dax-with-js
 * Serve   : https://cdn.jsdelivr.net/gh/sulaiman013/dax-with-js@demo-kpi-v1.0.0/demo/demo-kpi.js
 * License : MIT
 *
 * v1.4.0 card anatomy (after the "5 key elements of a good KPI card" pattern):
 *   1 headline   icon + a plain sentence that says what happened ("Down 3.5% on last year")
 *   2 measures   this period and the comparison period side by side, both labelled
 *   3 variance   absolute gap + a status pill (Ahead / Behind / Level)
 *   4 progress   this period as a bar against the comparison period's marker
 *   5 trend      12-period line with a dashed average line, footer states the window
 *
 * DATA CONTRACT - window.__demoKpi  (every value an INTEGER, locale-safe)
 *   asof 'YYYY-MM-DD' · doy/diy · dom/dim · wde (Sunday-week day count)
 *   s: 12-point series rev12/jobs12/fa12/leads12 (monthly) + revw12/jobsw12/faw12 (weekly), money in DOLLARS
 *   cur / pri: revY/revM/revW (CENTS) jobsY/jobsM/jobsW faY/faW leadsY/leadsW desM soldM cedM
 *   cm: Salesforce Community dashboard tiles pendV/pendN instV/instN aovV/aovN apcV/apcD c120S/c120C
 *
 * Sandbox notes: HTML Content (standard) iframe; DOM replaced + scripts re-run on every cross-filter/resize.
 * Install guard, style-inject-once, zero listeners, rAF-coalesced renders.
 */
(function () {
  'use strict';

  if (window.DEMOKPI && window.DEMOKPI.__installed) {
    window.DEMOKPI.render();
    return;
  }

  var T = {
    ink: '#282829', sec: '#71645C', faint: '#8F847C',
    line: '#E4DCD6', ground: '#F3EEEA', card: '#FFFFFF', head: '#FBF8F5',
    brand: '#821F2D', brandTk: '#F5E9EA',
    cur: '#1B7A4E', curDk: '#821F2D',
    goodTx: '#1B7A4E', goodTk: '#DDEFE4',
    badTx: '#C2410C', badTk: '#FDE7DA',
    naTx: '#71645C', naTk: '#EFE9E5'
  };

  /* closet-elevation line-art tile (same motif as the report canvas), as a CSS background */
  var TILE = (function () {
    var st = 'stroke=%22%2371645C%22 stroke-opacity=%220.10%22 stroke-width=%221.2%22 fill=%22none%22';
    var g = '<rect x=%2210%22 y=%2210%22 width=%22280%22 height=%22420%22 rx=%223%22 ' + st + '/>' +
      '<line x1=%2210%22 y1=%2256%22 x2=%22290%22 y2=%2256%22 ' + st + '/><line x1=%2218%22 y1=%2288%22 x2=%22282%22 y2=%2288%22 ' + st + '/>';
    for (var i = 0; i < 7; i++) { var cx = 36 + i * 38; g += '<path d=%22M' + cx + ' 80 q0 -9 6 -9 M' + cx + ' 88 l-16 13 h32 z%22 ' + st + '/>'; }
    for (var k = 0; k < 4; k++) { var y = 270 + k * 40; g += '<rect x=%2222%22 y=%22' + y + '%22 width=%22256%22 height=%2230%22 rx=%223%22 ' + st + '/>'; }
    return 'url("data:image/svg+xml,' + '<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22450%22>' + g + '</svg>' + '")';
  })();

  var CSS = [
    'html,body{height:100%;margin:0}',
    '#ick-root{background:', TILE, ' 0 0/300px 450px repeat,radial-gradient(ellipse at 8% 0%,rgba(154,1,47,.10),rgba(154,1,47,0) 45%),linear-gradient(180deg,#EDE2DE 0%,', T.ground, ' 30%,#F6F2EF 100%);border-top:4px solid ', T.brand, ';color:', T.ink, ";font-family:'Segoe UI',system-ui,-apple-system,sans-serif;",
      'padding:20px 24px 16px;min-height:100vh;box-sizing:border-box;display:flex;flex-direction:column}',
    '#ick-root *{box-sizing:border-box}',
    '.ick-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap;',
      'border-bottom:3px solid ', T.brand, ';padding-bottom:12px;margin-bottom:16px}',
    '.ick-eyebrow{font-size:10.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:', T.brand, ';margin-bottom:2px}',
    ".ick-title{font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:400;letter-spacing:-.01em}",
    '.ick-title span{color:', T.faint, ';font-weight:400}',
    '.ick-asof{text-align:right;color:', T.sec, ';font-size:11.5px;line-height:1.5}',
    '.ick-asof b{color:', T.ink, ';font-weight:600}',
    '.ick-sec{margin-bottom:16px;flex:1;display:flex;flex-direction:column;min-height:0}',
    '.ick-sechead{display:flex;align-items:center;gap:9px;margin-bottom:9px}',
    '.ick-tag{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:', T.curDk, ';white-space:nowrap}',
    '.ick-win{font-size:12px;color:', T.faint, ';white-space:nowrap}',
    '.ick-rule{flex:1;height:1px;background:', T.line, ';min-width:10px}',
    '.ick-grid{flex:1;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));grid-auto-rows:minmax(0,1fr);gap:12px;min-height:0}',
    '.ick-grid.c4{grid-template-columns:repeat(4,minmax(0,1fr))}',
    '.k{background:', T.card, ';border:1px solid ', T.line, ';border-radius:14px;display:flex;flex-direction:column;min-width:0;overflow:hidden;',
      'box-shadow:0 1px 2px rgba(26,29,46,.04)}',
    '.k-hd{display:flex;align-items:center;gap:9px;padding:10px 13px;background:', T.head, ';border-bottom:1px solid ', T.line, '}',
    '.k-ico{flex:none;width:28px;height:28px;border-radius:8px;background:', T.brandTk, ';color:', T.brand, ';display:flex;align-items:center;justify-content:center}',
    '.k-ico svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}',
    '.k-hl{min-width:0;font-size:13.5px;font-weight:600;line-height:1.3;color:', T.ink, '}',
    '.k-hl small{display:block;font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:', T.faint, ';line-height:1.4}',
    '.k-bd{flex:1;display:flex;flex-direction:column;gap:7px;padding:10px 13px 9px;min-height:0}',
    '.k-nums{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:10px;align-items:end}',
    '.k-nums.one{grid-template-columns:minmax(0,1fr)}',
    '.k-lab{font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:', T.faint, ';margin-bottom:1px;white-space:nowrap}',
    '.k-val{font-size:clamp(17px,min(2.4vh,1.8vw),27px);font-weight:700;line-height:1.32;letter-spacing:-.01em;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.k-pri{font-size:clamp(12px,min(1.6vh,1.15vw),17px);font-weight:600;color:', T.sec, ';line-height:1.35;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.k-var{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12.5px;line-height:1.35;color:', T.sec, ';min-height:20px}',
    '.k-var b{font-weight:700}',
    '.k-pill{flex:none;font-size:11px;font-weight:700;padding:2px 9px;border-radius:999px;letter-spacing:.02em;line-height:1.5}',
    '.k-prog{flex:none;position:relative;height:9px;border-radius:5px;background:', T.naTk, ';margin:2px 0}',
    '.k-prog i{position:absolute;left:0;top:0;bottom:0;border-radius:5px;background:', T.cur, '}',
    '.k-prog em{position:absolute;top:-3px;bottom:-3px;width:2px;background:', T.ink, ';border-radius:1px}',
    '.k-trend{flex:1;min-height:28px;position:relative}',
    '.k-trend svg{position:absolute;inset:0;width:100%;height:100%;display:block}',
    '.k-note{flex:1;font-size:12px;color:', T.sec, ';line-height:1.45}',
    '.k-note b{color:', T.ink, ';font-weight:600}',
    '.k-ft{display:flex;justify-content:space-between;gap:8px;padding:6px 13px 8px;border-top:1px dashed ', T.line, ';font-size:10.5px;line-height:1.4;color:', T.faint, '}',
    '.ick-notes{flex:none;margin-top:2px;padding:10px 16px;background:', T.card, ';border:1px solid ', T.line,
      ';border-radius:8px;font-size:10.8px;color:', T.sec, ';line-height:1.6}',
    '.ick-notes b{color:', T.ink, '}',
    '@media(max-width:900px){.ick-grid,.ick-grid.c4{grid-template-columns:repeat(2,minmax(0,1fr))}}',
    '@media(max-height:1239px){.k-hd{padding:8px 12px}.k-bd{gap:5px;padding:8px 12px 7px}.k-ft{padding:5px 12px 6px}.ick-sec{margin-bottom:11px}.ick-grid{gap:10px}',
      '.ick-head{padding-bottom:9px;margin-bottom:11px}.ick-notes{padding:7px 12px;font-size:10px;line-height:1.5}}'
  ].join('');

  function money(cents) { return '$' + Math.round(cents / 100).toLocaleString('en-US'); }
  function moneyFull(cents) { return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function num(n) { return Number(n).toLocaleString('en-US'); }
  function fmtv(v, f) {
    if (v == null || isNaN(v)) return '–';
    if (f === 'money') return money(v);
    if (f === 'pct') return (v * 100).toFixed(1) + '%';
    if (f === 'dec') return v.toFixed(1);
    return num(v);
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var ICONS = {
    dollar: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/><path d="M10 5.5v9M12.6 7.4c-.5-.8-1.5-1.3-2.6-1.3-1.4 0-2.5.8-2.5 1.9 0 2.5 5 1.4 5 3.9 0 1.1-1.1 1.9-2.5 1.9-1.1 0-2.1-.5-2.6-1.3"/></svg>',
    tag: '<svg viewBox="0 0 20 20"><path d="M3 3h6l8 8-6 6-8-8z"/><circle cx="7" cy="7" r="1.4"/></svg>',
    cal: '<svg viewBox="0 0 20 20"><rect x="3" y="4.5" width="14" height="12" rx="2"/><path d="M3 8.5h14M7 3v3M13 3v3M7.6 12.4l1.7 1.7 3.1-3.6"/></svg>',
    userplus: '<svg viewBox="0 0 20 20"><circle cx="8" cy="7" r="2.8"/><path d="M3.2 16.5c.5-2.6 2.4-4.3 4.8-4.3s4.3 1.7 4.8 4.3M14.5 8h4M16.5 6v4"/></svg>',
    users: '<svg viewBox="0 0 20 20"><circle cx="7" cy="7.5" r="2.6"/><circle cx="13.5" cy="8.5" r="2.1"/><path d="M2.8 16.3c.4-2.4 2.1-4 4.2-4s3.8 1.6 4.2 4M12 12.9c1.9.2 3.4 1.6 3.8 3.4"/></svg>',
    pct: '<svg viewBox="0 0 20 20"><path d="M5.5 14.5l9-9"/><circle cx="6.6" cy="6.6" r="1.9"/><circle cx="13.4" cy="13.4" r="1.9"/></svg>',
    receipt: '<svg viewBox="0 0 20 20"><path d="M5.5 3h9v14l-1.8-1.3-1.6 1.3-1.6-1.3L7.9 17l-2.4-1.3z"/><path d="M8 7h4M8 10h4"/></svg>',
    box: '<svg viewBox="0 0 20 20"><path d="M3 6.5 10 3l7 3.5v7L10 17l-7-3.5z"/><path d="M3 6.5 10 10l7-3.5M10 10v7"/></svg>'
  };

  function trend(series) {
    if (!series || series.length < 2) return '';
    var n = series.length, mx = Math.max.apply(null, series), mn = Math.min.apply(null, series);
    var avg = series.reduce(function (a, b) { return a + b; }, 0) / n;
    if (mx === mn) { mx = mn + 1; }
    var pad = (mx - mn) * 0.12; mx += pad; mn = Math.max(0, mn - pad);
    function y(v) { return (30 - ((v - mn) / (mx - mn)) * 26).toFixed(1); }
    var pts = series.map(function (v, i) { return ((i / (n - 1)) * 96 + 2).toFixed(1) + ',' + y(v); });
    var last = pts[n - 1].split(',');
    return '<div class="k-trend"><svg viewBox="0 0 100 32" preserveAspectRatio="none">' +
      '<line x1="2" x2="98" y1="' + y(avg) + '" y2="' + y(avg) + '" stroke="' + T.faint + '" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>' +
      '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + T.cur + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.6" fill="' + T.cur + '" stroke="' + T.card + '" stroke-width="1.4" vector-effect="non-scaling-stroke"/>' +
      '</svg></div>';
  }

  function status(cur, pri, kind) {
    if (pri == null || cur == null) return null;
    var d = kind === 'pp' ? cur - pri : (pri === 0 ? (cur > 0 ? 1 : 0) : (cur - pri) / pri);
    var tol = kind === 'pp' ? 0.005 : 0.01;
    if (Math.abs(d) < tol) return { word: 'Level', tx: T.naTx, tk: T.naTk, dir: 'level', d: d };
    return d > 0 ? { word: 'Ahead', tx: T.goodTx, tk: T.goodTk, dir: 'up', d: d } : { word: 'Behind', tx: T.badTx, tk: T.badTk, dir: 'down', d: d };
  }

  function card(c) {
    var st = (c.kind === 'nocmp' || c.kind === 'none') ? null : status(c.cur, c.pri, c.kind === 'pp' ? 'pp' : 'pct');
    var hl;
    if (c.hl) hl = c.hl;
    else if (!st) hl = c.label;
    else if (st.word === 'Level') hl = 'Level with ' + c.P.vs;
    else hl = (st.dir === 'up' ? 'Up ' : 'Down ') + (c.kind === 'pp' ? Math.abs(st.d * 100).toFixed(1) + ' pts' : Math.abs(st.d * 100).toFixed(1) + '%') + ' on ' + c.P.vs;
    var tt = c.title ? ' title="' + esc(c.title) + '"' : '';
    var head = '<div class="k-hd"><span class="k-ico">' + (ICONS[c.icon] || '') + '</span><div class="k-hl"><small>' + esc(c.label) + '</small>' + esc(hl) + '</div></div>';
    var nums;
    if (c.kind === 'none') {
      nums = '<div class="k-nums one"><div><div class="k-lab">' + esc(c.P.cur) + '</div><div class="k-val"' + tt + '>' + fmtv(c.cur, c.fmt) + '</div></div></div>';
    } else {
      nums = '<div class="k-nums"><div><div class="k-lab">' + esc(c.P.cur) + '</div><div class="k-val"' + tt + '>' + fmtv(c.cur, c.fmt) + '</div></div>' +
        '<div><div class="k-lab">' + esc(c.P.pri) + '</div><div class="k-pri">' + (c.kind === 'nocmp' ? '–' : fmtv(c.pri, c.fmt)) + '</div></div></div>';
    }
    var vline = '', prog = '';
    if (st) {
      var gap = c.cur - c.pri, sg = gap >= 0 ? '+' : '−';
      var absTxt = c.kind === 'pp' ? sg + Math.abs(gap * 100).toFixed(1) + ' pts'
        : sg + (c.fmt === 'money' ? money(Math.abs(gap)) : c.fmt === 'dec' ? Math.abs(gap).toFixed(1) : num(Math.abs(gap)));
      vline = '<div class="k-var"><span><b style="color:' + st.tx + '">' + (st.word === 'Ahead' ? '▲ ' : st.word === 'Behind' ? '▼ ' : '■ ') + absTxt + '</b> vs ' + esc(c.P.vs) + '</span>' +
        '<span class="k-pill" style="color:' + st.tx + ';background:' + st.tk + '">' + st.word + '</span></div>';
      var scale = c.kind === 'pp' ? 1 : Math.max(c.cur || 0, c.pri || 0, 1e-9);
      prog = '<div class="k-prog" title="Bar = ' + esc(c.P.cur.toLowerCase()) + ', black marker = ' + esc(c.P.vs) + '"><i style="width:' + Math.min(100, (c.cur || 0) / scale * 100).toFixed(1) + '%"></i>' +
        '<em style="left:calc(' + Math.min(100, (c.pri || 0) / scale * 100).toFixed(1) + '% - 1px)"></em></div>';
    } else if (c.kind === 'nocmp') {
      vline = '<div class="k-var"><span>' + esc(c.note || '') + '</span><span class="k-pill" style="color:' + T.naTx + ';background:' + T.naTk + '">New</span></div>';
    } else if (c.kind === 'none') {
      vline = '<div class="k-var"><span>' + (c.abs || '') + '</span></div>';
    }
    var mid = c.series ? trend(c.series) : '<div class="k-note">' + (c.kind === 'none' ? (c.note || '') : (c.abs || '')) + '</div>';
    var foot = '<div class="k-ft"><span>' + esc(c.foot || '') + '</span><span>' + (c.series ? esc(c.trendWin) + ' trend, dashed = avg' : esc(c.foot2 || '')) + '</span></div>';
    return '<div class="k">' + head + '<div class="k-bd">' + nums + vline + prog + mid + '</div>' + foot + '</div>';
  }

  function section(tag, win, cards, cols) {
    var cells = '';
    for (var i = 0; i < cards.length; i++) cells += card(cards[i]);
    return '<div class="ick-sec"><div class="ick-sechead"><span class="ick-tag">' + tag + '</span><span class="ick-win">' + win + '</span>' +
      '<div class="ick-rule"></div></div><div class="ick-grid' + (cols === 4 ? ' c4' : '') + '">' + cells + '</div></div>';
  }

  function build(d) {
    var c = d.cur || {}, p = d.pri || {}, sr = d.s || {}, cm = d.cm || {};
    var mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var parts = String(d.asof || '').split('-');
    var asofNice = parts.length === 3 ? mons[(+parts[1] || 1) - 1] + ' ' + (+parts[2]) + ', ' + parts[0] : String(d.asof || '');
    var asofShort = parts.length === 3 ? mons[(+parts[1] || 1) - 1] + ' ' + (+parts[2]) : '';
    var yr = +parts[0] || 0;
    function ratio(a, b) { return b ? a / b : null; }

    var PY = { cur: 'This year', pri: 'Last year', vs: 'last year' };
    var PM = { cur: 'This month', pri: 'Last month', vs: 'last month' };
    var PW = { cur: 'This week', pri: 'Last week', vs: 'last week' };
    var fY = 'Jan 1 – ' + asofShort + ', same days';
    var fM = 'Day ' + d.dom + ' of ' + d.dim + ', same days';
    var fW = 'Day ' + d.wde + ' of 7, same days';
    var faNew = (p.faY || 0) * 5 < (c.faY || 0);

    var year = section('This year', 'Jan 1 – ' + asofNice + ' compared with the same days of ' + (yr - 1), [
      { icon: 'dollar', label: 'Sold revenue', fmt: 'money', cur: c.revY, pri: p.revY, P: PY, series: sr.rev12, trendWin: '12-month', foot: fY, title: moneyFull(c.revY || 0) },
      { icon: 'tag', label: 'Jobs sold', fmt: 'count', cur: c.jobsY, pri: p.jobsY, P: PY, series: sr.jobs12, trendWin: '12-month', foot: fY },
      { icon: 'cal', label: 'First appointments', fmt: 'count', cur: c.faY, pri: p.faY, P: PY, series: sr.fa12, trendWin: '12-month', foot: 'Jan 1 – ' + asofShort,
        kind: faNew ? 'nocmp' : undefined, note: 'Tracked in Salesforce since 2025',
        hl: faNew ? 'No comparable last year' : undefined },
      { icon: 'userplus', label: 'New leads', fmt: 'count', cur: c.leadsY, pri: p.leadsY, P: PY, series: sr.leads12, trendWin: '12-month', foot: fY }
    ], 4);

    var avgC = c.jobsM ? Math.round(c.revM / c.jobsM) : null, avgP = p.jobsM ? Math.round(p.revM / p.jobsM) : null;
    var month = section('This month', 'Day ' + d.dom + ' of ' + d.dim + ' compared with the same days last month', [
      { icon: 'dollar', label: 'Revenue', fmt: 'money', cur: c.revM, pri: p.revM, P: PM, series: sr.revw12, trendWin: '12-week', foot: fM, title: moneyFull(c.revM || 0) },
      { icon: 'tag', label: 'Jobs sold', fmt: 'count', cur: c.jobsM, pri: p.jobsM, P: PM, series: sr.jobsw12, trendWin: '12-week', foot: fM },
      { icon: 'users', label: 'Active designers', fmt: 'count', cur: c.desM, pri: p.desM, P: PM, foot: fM, foot2: 'new opportunity',
        abs: 'Designers with at least one new opportunity this month.' },
      { icon: 'pct', label: 'Closing %', fmt: 'pct', kind: 'pp', cur: ratio(c.soldM, c.cedM), pri: ratio(p.soldM, p.cedM), P: PM, foot: fM, foot2: 'Community formula',
        abs: '<b>' + num(c.soldM || 0) + '</b> sold ÷ <b>' + num(c.cedM || 0) + '</b> created this month (excl. Dead Lead)' },
      { icon: 'receipt', label: 'Average sale', fmt: 'money', cur: avgC, pri: avgP, P: PM, foot: fM, foot2: 'sold $ ÷ jobs',
        abs: '<b>' + money(c.revM || 0) + '</b> ÷ <b>' + num(c.jobsM || 0) + '</b> jobs sold', title: avgC == null ? '' : moneyFull(avgC) }
    ]);

    var apdC = c.desM ? c.faW / c.desM : null, apdP = p.desM ? p.faW / p.desM : null;
    var week = section('This week', 'Sunday start, day ' + d.wde + ' of 7, compared with the same days last week', [
      { icon: 'dollar', label: 'Revenue', fmt: 'money', cur: c.revW, pri: p.revW, P: PW, series: sr.revw12, trendWin: '12-week', foot: fW, title: moneyFull(c.revW || 0) },
      { icon: 'tag', label: 'Jobs sold', fmt: 'count', cur: c.jobsW, pri: p.jobsW, P: PW, series: sr.jobsw12, trendWin: '12-week', foot: fW },
      { icon: 'cal', label: 'First appointments', fmt: 'count', cur: c.faW, pri: p.faW, P: PW, series: sr.faw12, trendWin: '12-week', foot: fW },
      { icon: 'users', label: 'Appointments per designer', fmt: 'dec', cur: apdC, pri: apdP, P: PW, foot: fW, foot2: 'appts ÷ designers',
        abs: '<b>' + num(c.faW || 0) + '</b> first appointments ÷ <b>' + num(c.desM || 0) + '</b> active designers' },
      { icon: 'pct', label: 'Lead to appointment', fmt: 'pct', kind: 'pp', cur: ratio(c.faW, c.leadsW), pri: ratio(p.faW, p.leadsW), P: PW, foot: fW, foot2: 'partial week',
        abs: '<b>' + num(c.faW || 0) + '</b> first appointments from <b>' + num(c.leadsW || 0) + '</b> new leads' }
    ]);

    var PC = { cur: 'All designers' };
    var community = section('Salesforce Community dashboard', 'Same definitions as the Community dashboard tiles, all designers combined', [
      { icon: 'box', label: 'Pending project value', fmt: 'money', kind: 'none', cur: cm.pendV, P: PC, title: moneyFull(cm.pendV || 0),
        hl: 'Open pipeline awaiting a decision', abs: '<b>' + num(cm.pendN || 0) + '</b> projects in Design or Propose',
        note: 'Every open project still in Design or Propose.', foot: 'All open projects', foot2: 'My Pending Value' },
      { icon: 'receipt', label: 'Installed, 100% complete', fmt: 'money', kind: 'none', cur: cm.instV, P: PC, title: moneyFull(cm.instV || 0),
        hl: 'Installed and fully complete', abs: '<b>' + num(cm.instN || 0) + '</b> projects completed',
        note: 'Projects in Complete by final completion date.', foot: 'Last 24 months', foot2: 'My $ Installed' },
      { icon: 'dollar', label: 'Average order value', fmt: 'money', kind: 'none', cur: cm.aovN ? Math.round(cm.aovV / cm.aovN) : null, P: PC,
        hl: 'Average value of an order', abs: '<b>' + num(cm.aovN || 0) + '</b> orders worth <b>' + money(cm.aovV || 0) + '</b>',
        note: 'Projects by Target Ready to Order Date.', foot: 'Last 16 weeks', foot2: 'My AOV' },
      { icon: 'cal', label: 'Avg $ per initial consult', fmt: 'money', kind: 'none', cur: cm.apcD ? Math.round(cm.apcV / cm.apcD) : null, P: PC,
        hl: 'Sales per first appointment', abs: '<b>' + money(cm.apcV || 0) + '</b> ÷ <b>' + num(cm.apcD || 0) + '</b> first appts',
        note: 'Orders in the last 3 months ÷ first appointments in the last 12 months.', foot: 'Last 3 months', foot2: 'My Avg $ per Consult' },
      { icon: 'pct', label: 'Closing % (120 days)', fmt: 'pct', kind: 'none', cur: cm.c120C ? cm.c120S / cm.c120C : null, P: PC,
        hl: 'New projects that became sales', abs: '<b>' + num(cm.c120S || 0) + '</b> sold ÷ <b>' + num(cm.c120C || 0) + '</b> created',
        note: 'Sold by sold date ÷ created, excluding Dead Lead.', foot: 'Last 120 days', foot2: 'My Closing %' }
    ]);

    return '<div class="ick-head"><div><div class="ick-eyebrow">Salesforce Sales &amp; Marketing · Demo</div>' +
      '<div class="ick-title">KPI Overview <span>· how the business is tracking</span></div></div>' +
      '<div class="ick-asof">Data as of <b>' + asofNice + '</b><br>Sales by sold date (Salesforce Community standard) · weeks start Sunday</div></div>' +
      year + month + week + community +
      '<div class="ick-notes"><b>How to read a card.</b> The headline says what happened. The big number is this period and the grey number is the same days of the comparison period. ' +
      'The green bar is this period and the black marker is the comparison period. The line is the recent trend and the dashed line is its average. ' +
      '<b>Sold</b> counts projects Salesforce marks as sold (Ready to Order, Ready to Install, Complete, Incomplete) by Original Project Sold Date. Hover a money value for the exact amount.</div>';
  }

  var queued = false;
  function render() {
    if (queued) return;
    queued = true;
    (window.requestAnimationFrame || window.setTimeout)(function () {
      queued = false;
      var root = document.getElementById('ick-root');
      if (!root) return;
      if (!document.getElementById('ick-style')) {
        var s = document.createElement('style'); s.id = 'ick-style'; s.textContent = CSS; document.head.appendChild(s);
      }
      var d = window.__demoKpi;
      root.innerHTML = d ? build(d) : '<div style="padding:24px;color:' + T.faint + ';font-family:Segoe UI,sans-serif">Waiting for data…</div>';
    });
  }

  window.DEMOKPI = { __installed: true, render: render, version: 'demo-kpi-v1.0.0' };
  render();
})();
