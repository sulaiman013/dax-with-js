/*!
 * Inspired Closets Chicago - "Lead Journey" panel for the Opportunity Journey page, rendered in JavaScript
 * ---------------------------------------------------------------------------
 * Repo    : https://github.com/sulaiman013/dax-with-js
 * Serve   : https://cdn.jsdelivr.net/gh/sulaiman013/dax-with-js@icch-journey-v1.0.1/icch/icch-journey.js
 * License : MIT
 *
 * Three views of the same leads (the DAX measure follows the report's Filters window):
 *   1 Journey River    source -> first contact -> studio -> outcome, band width = leads
 *   2 Speed to studio  typical days to each milestone + the no-response attempts ladder
 *   3 Channel scorecard leads, studio, sold, win rate, sold $ and sold $ per lead by source
 *
 * DATA CONTRACT - window.__icchJourney (integers only, locale-safe)
 *   asof 'YYYY-MM-DD' ; nopre = leads in view created before 2025 (no status history)
 *   r: [[channel, contact 0 first try | 1 after follow-up | 2 not booked, studio 0|1, outcome code, leads, sold dollars], ...]
 *      outcome code: S Sold, P Proposed, L Lost, D Dead Lead, N Nurturing, W Still working, C Closed
 *   t: [sched median, sched p75, sched n, studio median, studio p75, studio n, sold median, sold p75, sold n] (tenths of a day)
 *   a: [[attempts 0..5, leads, booked], ...]
 *
 * Sandbox notes: HTML Content (standard) iframe; DOM replaced + scripts re-run on every cross-filter/resize.
 * Install guard, style-inject-once, rAF-coalesced renders, 100vh root.
 */
(function () {
  'use strict';

  if (window.ICCHJOURNEY && window.ICCHJOURNEY.__installed) {
    window.ICCHJOURNEY.render();
    return;
  }

  var T = {
    ink: '#282829', sec: '#71645C', faint: '#8F847C', line: '#E4DCD6', ground: '#F3EEEA', card: '#FFFFFF',
    head: '#FBF8F5', brand: '#821F2D', navy: '#2F4858', track: '#EFE9E5'
  };
  var CONTACT = [
    { k: 0, name: 'Booked first try', col: '#2F7E79' },
    { k: 1, name: 'Booked after follow-up', col: '#C98A12' },
    { k: 2, name: 'Not booked', col: '#A39A93' }
  ];
  var STUDIO = [
    { k: 1, name: 'Reached the studio', col: '#2F4858' },
    { k: 0, name: 'No studio visit', col: '#C9C0B8' }
  ];
  var OUTCOME = [
    { k: 'S', name: 'Sold', col: '#1B7A4E' },
    { k: 'P', name: 'Proposed', col: '#3B6FB6' },
    { k: 'L', name: 'Lost', col: '#E07B39' },
    { k: 'D', name: 'Dead Lead', col: '#666666' },
    { k: 'N', name: 'Nurturing', col: '#8E7CC3' },
    { k: 'W', name: 'Still working', col: '#B8A99A' },
    { k: 'C', name: 'Closed', col: '#D8CFC8' }
  ];
  var MAX_SOURCES = 9;

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
    '#icj-root{background:', TILE, ' 0 0/300px 450px repeat,radial-gradient(ellipse at 8% 0%,rgba(154,1,47,.10),rgba(154,1,47,0) 45%),linear-gradient(180deg,#EDE2DE 0%,', T.ground, ' 30%,#F6F2EF 100%);',
      'border-top:4px solid ', T.brand, ';color:', T.ink, ";font-family:'Segoe UI',system-ui,-apple-system,sans-serif;",
      'padding:10px 14px 8px;height:100vh;box-sizing:border-box;display:flex;flex-direction:column;gap:10px;overflow:hidden}',
    '#icj-root *{box-sizing:border-box}',
    '.j-head{flex:none;display:flex;align-items:flex-end;justify-content:space-between;gap:14px;border-bottom:3px solid ', T.brand, ';padding-bottom:9px}',
    '.j-eyebrow{font-size:10.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:', T.brand, ';margin-bottom:2px}',
    ".j-title{font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:400;letter-spacing:-.01em;line-height:1.15}",
    '.j-title span{color:', T.faint, '}',
    '.j-asof{text-align:right;color:', T.sec, ';font-size:11.5px;line-height:1.5}',
    '.j-asof b{color:', T.ink, ';font-weight:600}',
    '.j-card{background:', T.card, ';border:1px solid ', T.line, ';border-radius:14px;box-shadow:0 1px 2px rgba(26,29,46,.04);display:flex;flex-direction:column;min-height:0;min-width:0;overflow:hidden}',
    '.j-chd{flex:none;display:flex;align-items:baseline;gap:10px;padding:10px 14px 6px}',
    '.j-tag{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:', T.brand, ';white-space:nowrap}',
    '.j-sub{font-size:12px;color:', T.faint, ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.j-sel{margin-left:auto;font-size:11.5px;color:', T.sec, ';white-space:nowrap}',
    '.j-sel b{color:', T.ink, '}',
    '.j-river{flex:1.25;min-height:0}',
    '.j-svg{flex:1;min-height:0;position:relative}',
    '.j-svg svg{position:absolute;inset:0;width:100%;height:100%;display:block}',
    '.j-row{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.12fr);gap:12px}',
    '.j-body{flex:1;min-height:0;padding:0 14px 8px;display:flex;flex-direction:column;gap:7px}',
    '.j-miles{flex:none;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}',
    '.j-mile{border:1px solid ', T.line, ';border-radius:10px;padding:6px 10px;background:', T.head, '}',
    '.j-mile small{display:block;font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:', T.faint, '}',
    '.j-mile b{display:block;font-size:20px;font-weight:700;line-height:1.2;font-variant-numeric:tabular-nums}',
    '.j-mile span{font-size:11px;line-height:1.35;color:', T.sec, ';display:block}',
    '.j-ladder{flex:1;min-height:0;display:flex;flex-direction:column;gap:2px}',
    '.j-lh{font-size:11.5px;color:', T.sec, ';line-height:1.4}',
    '.j-lh b{color:', T.ink, '}',
    '.j-lrow{flex:1;min-height:11px;display:grid;grid-template-columns:120px minmax(0,1fr) 92px;align-items:center;gap:10px;font-size:12px}',
    '.j-lrow .lab{color:', T.sec, ';white-space:nowrap}',
    '.j-bar{position:relative;height:72%;max-height:18px;background:', T.track, ';border-radius:4px;overflow:hidden}',
    '.j-bar i{position:absolute;left:0;top:0;bottom:0;background:#C9C0B8}',
    '.j-bar em{position:absolute;left:0;top:0;bottom:0;background:#2F7E79}',
    '.j-lrow .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;color:', T.ink, '}',
    '.j-lrow .num small{color:', T.faint, '}',
    '.j-tbl{flex:1;min-height:0;display:flex;flex-direction:column}',
    '.j-tr{flex:1;min-height:12px;display:grid;grid-template-columns:minmax(0,1.5fr) 54px minmax(0,1.6fr) 52px 74px 78px;align-items:center;gap:8px;',
      'font-size:12px;border-bottom:1px solid ', T.track, ';font-variant-numeric:tabular-nums}',
    '.j-tr.h{flex:none;min-height:0;padding-bottom:5px;font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:', T.faint, '}',
    '.j-tr .c{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.j-tr .r{text-align:right;white-space:nowrap}',
    '.j-tr .v{text-align:right;font-weight:700;white-space:nowrap}',
    '.j-fun{position:relative;height:10px;background:', T.track, ';border-radius:5px;overflow:hidden}',
    '.j-fun i{position:absolute;left:0;top:0;bottom:0;background:#2F4858;opacity:.55}',
    '.j-fun em{position:absolute;left:0;top:0;bottom:0;background:#1B7A4E}',
    '.j-legend{flex:none;display:flex;gap:14px;font-size:11px;color:', T.sec, ';padding-top:4px}',
    '.j-legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}',
    '.j-note{flex:none;font-size:10.5px;color:', T.sec, ';line-height:1.5}',
    '.j-note b{color:', T.ink, '}',
    '.j-empty{flex:1;display:flex;align-items:center;justify-content:center;color:', T.sec, ';font-size:14px}',
    '.j-src{cursor:pointer}',
    '.j-flow{transition:opacity .15s}',
    '.j-flow:hover{opacity:.62 !important}'
  ].join('');

  var state = { sel: null };

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n0(v) { return Math.round(v || 0).toLocaleString('en-US'); }
  function pct(a, b) { return b ? Math.round(a * 100 / b) + '%' : '-'; }
  function money(v) {
    v = v || 0;
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(v >= 1e7 ? 1 : 2) + 'M';
    if (v >= 1e4) return '$' + Math.round(v / 1e3) + 'K';
    return '$' + n0(v);
  }
  function days(t10) {
    if (t10 == null) return '-';
    var d = t10 / 10;
    if (d < 1) return 'under 1 day';
    return (d < 10 ? d.toFixed(1).replace(/\.0$/, '') : Math.round(d)) + (d === 1 ? ' day' : ' days');
  }
  function find(list, k) { for (var i = 0; i < list.length; i++) if (list[i].k === k) return list[i]; return null; }

  /* ---------- data shaping ---------- */
  function shape(d) {
    var rows = (d.r || []).map(function (x) { return { ch: x[0] || '(blank)', c: +x[1], s: +x[2], o: x[3], n: +x[4], amt: +x[5] }; });
    var bySrc = {};
    rows.forEach(function (r) {
      var b = bySrc[r.ch] || (bySrc[r.ch] = { name: r.ch, n: 0, studio: 0, sold: 0, amt: 0 });
      b.n += r.n; if (r.s === 1) b.studio += r.n; if (r.o === 'S') { b.sold += r.n; b.amt += r.amt; }
    });
    var srcs = Object.keys(bySrc).map(function (k) { return bySrc[k]; }).sort(function (a, b) { return b.n - a.n; });
    var keep = {}; srcs.slice(0, MAX_SOURCES).forEach(function (s) { keep[s.name] = 1; });
    var other = srcs.length > MAX_SOURCES;
    rows.forEach(function (r) { r.src = keep[r.ch] ? r.ch : 'Other sources'; });
    var total = rows.reduce(function (a, r) { return a + r.n; }, 0);
    return { rows: rows, srcs: srcs, total: total, other: other };
  }

  /* ---------- river (sankey) ---------- */
  function river(el, D) {
    var W = el.clientWidth, H = el.clientHeight;
    if (W < 200 || H < 120) { el.innerHTML = ''; return; }
    var rows = D.rows, sel = state.sel;
    var srcNames = [];
    D.srcs.slice(0, MAX_SOURCES).forEach(function (s) { srcNames.push(s.name); });
    if (D.other) srcNames.push('Other sources');
    var cols = [
      srcNames.map(function (nm) { return { k: nm, name: nm, col: T.navy }; }),
      CONTACT, STUDIO, OUTCOME
    ];
    var key = [function (r) { return r.src; }, function (r) { return r.c; }, function (r) { return r.s; }, function (r) { return r.o; }];
    var colN = cols.map(function (list, ci) {
      var m = {}; list.forEach(function (nd) { m[nd.k] = 0; });
      rows.forEach(function (r) { var k = key[ci](r); if (m[k] != null) m[k] += r.n; });
      return m;
    });
    // drop empty nodes in the right three columns
    cols = cols.map(function (list, ci) { return ci === 0 ? list : list.filter(function (nd) { return colN[ci][nd.k] > 0; }); });
    var padT = 6, padB = 6, gap = 8, nodeW = 13;
    var labL = Math.min(200, Math.max(130, W * 0.13)), labR = Math.min(230, Math.max(150, W * 0.16));
    var xs = [labL, W * 0.40, W * 0.62, W - labR - nodeW];
    var scale = Infinity;
    cols.forEach(function (list) { var k = list.length; var s = (H - padT - padB - gap * (k - 1)) / D.total; if (s < scale) scale = s; });
    var pos = cols.map(function (list, ci) {
      var used = list.reduce(function (a, nd) { return a + colN[ci][nd.k] * scale; }, 0) + gap * (list.length - 1);
      var y = padT + (H - padT - padB - used) / 2, m = {};
      list.forEach(function (nd) { var h = colN[ci][nd.k] * scale; m[nd.k] = { y: y, h: h, out: y, inn: y }; y += h + gap; });
      return m;
    });
    var svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" font-family="Segoe UI, system-ui, sans-serif">'];
    // flows between consecutive columns, ordered by target to limit crossings
    for (var ci = 0; ci < 3; ci++) {
      var agg = {};
      rows.forEach(function (r) {
        var a = key[ci](r), b = key[ci + 1](r);
        if (!pos[ci][a] || !pos[ci + 1][b]) return;
        var kk = a + '\u0001' + b, f = agg[kk] || (agg[kk] = { a: a, b: b, n: 0, hn: 0 });
        f.n += r.n; if (sel && r.src === sel) f.hn += r.n;
      });
      var flows = Object.keys(agg).map(function (k) { return agg[k]; });
      var orderA = cols[ci].map(function (nd) { return nd.k; }), orderB = cols[ci + 1].map(function (nd) { return nd.k; });
      flows.sort(function (f, g) { return (orderA.indexOf(f.a) - orderA.indexOf(g.a)) || (orderB.indexOf(f.b) - orderB.indexOf(g.b)); });
      var x0 = xs[ci] + nodeW, x1 = xs[ci + 1], mx = (x0 + x1) / 2;
      var tgtName = function (k) { var nd = find(cols[ci + 1], k); return nd ? nd.name : k; };
      var srcName = function (k) { var nd = find(cols[ci], k); return nd ? nd.name : k; };
      flows.forEach(function (f) {
        var h = f.n * scale, pa = pos[ci][f.a], pb = pos[ci + 1][f.b];
        var ya = pa.out, yb = pb.inn; pa.out += h; pb.inn += h;
        var col = (find(cols[ci + 1], f.b) || {}).col || T.navy;
        var d = 'M' + x0 + ',' + ya + ' C' + mx + ',' + ya + ' ' + mx + ',' + yb + ' ' + x1 + ',' + yb +
          ' L' + x1 + ',' + (yb + h) + ' C' + mx + ',' + (yb + h) + ' ' + mx + ',' + (ya + h) + ' ' + x0 + ',' + (ya + h) + ' Z';
        var base = sel ? 0.10 : 0.30;
        svg.push('<path class="j-flow" d="' + d + '" fill="' + col + '" opacity="' + base + '"><title>' +
          esc(srcName(f.a) + ' → ' + tgtName(f.b) + ': ' + n0(f.n) + ' leads (' + pct(f.n, colN[ci][f.a]) + ' of ' + srcName(f.a) + ')') + '</title></path>');
        if (sel && f.hn > 0) {
          var hh = f.hn * scale;
          var dh = 'M' + x0 + ',' + ya + ' C' + mx + ',' + ya + ' ' + mx + ',' + yb + ' ' + x1 + ',' + yb +
            ' L' + x1 + ',' + (yb + hh) + ' C' + mx + ',' + (yb + hh) + ' ' + mx + ',' + (ya + hh) + ' ' + x0 + ',' + (ya + hh) + ' Z';
          svg.push('<path d="' + dh + '" fill="' + col + '" opacity="0.62" pointer-events="none"/>');
        }
      });
    }
    // label positions: keep at least 15px between single-line labels so small nodes never collide
    var labY = cols.map(function (list, ci) {
      var m = {}, prev = -Infinity;
      list.forEach(function (nd) {
        var p = pos[ci][nd.k], want = p.y + p.h / 2, room = (ci === 1 || ci === 2) && p.h >= 22 ? 30 : 15;
        var y = Math.max(want, prev + 15); m[nd.k] = y; prev = y + (room - 15);
      });
      return m;
    });
    // nodes + labels
    cols.forEach(function (list, ci) {
      list.forEach(function (nd) {
        var p = pos[ci][nd.k], v = colN[ci][nd.k], x = xs[ci];
        var dim = sel && ci === 0 && nd.k !== sel;
        svg.push('<rect x="' + x + '" y="' + p.y + '" width="' + nodeW + '" height="' + Math.max(p.h, 1) + '" rx="2" fill="' + nd.col + '"' +
          (dim ? ' opacity="0.35"' : '') + (ci === 0 ? ' class="j-src" data-src="' + esc(nd.k) + '"' : '') + '><title>' +
          esc(nd.name + ': ' + n0(v) + ' leads (' + pct(v, D.total) + ')') + '</title></rect>');
        var cy = labY[ci][nd.k], big = p.h >= 22;
        if (ci === 0) {
          svg.push('<text x="' + (x - 8) + '" y="' + (cy + 4) + '" text-anchor="end" font-size="12" fill="' + (dim ? T.faint : T.ink) + '" class="j-src" data-src="' + esc(nd.k) + '">' +
            esc(nd.name) + ' <tspan fill="' + T.faint + '">' + n0(v) + '</tspan></text>');
        } else if (ci === 3) {
          var extra = '';
          if (nd.k === 'S') { var amt = 0; rows.forEach(function (r) { if (r.o === 'S') amt += r.amt; }); extra = ' · ' + money(amt); }
          svg.push('<text x="' + (x + nodeW + 8) + '" y="' + (cy + 4) + '" font-size="12.5" fill="' + T.ink + '">' + (nd.k === 'S' ? '<tspan font-weight="700">' : '<tspan>') +
            esc(nd.name) + '</tspan> <tspan fill="' + T.faint + '">' + n0(v) + ' (' + pct(v, D.total) + ')' + esc(extra) + '</tspan></text>');
        } else {
          var lx = x + nodeW + 7;
          svg.push('<text x="' + lx + '" y="' + (big ? cy - 2 : cy + 4) + '" font-size="12" font-weight="600" fill="' + T.ink + '">' + esc(nd.name) + '</text>');
          if (big) svg.push('<text x="' + lx + '" y="' + (cy + 13) + '" font-size="11.5" fill="' + T.faint + '">' + n0(v) + ' leads · ' + pct(v, D.total) + '</text>');
        }
      });
    });
    // column captions
    var cap = ['Lead source', 'First contact', 'Studio', 'Where they are now'];
    svg.push('</svg>');
    el.innerHTML = svg.join('');
    var hs = el.parentNode.querySelector('.j-caps');
    if (hs) hs.innerHTML = cap.map(function (c, i) {
      var left = i === 0 ? 0 : xs[i] / W * 100;
      return '<span style="position:absolute;left:' + (i === 0 ? '0' : left + '%') + (i === 0 ? ';width:' + (labL - 8) + 'px;text-align:right' : '') + '">' + c + '</span>';
    }).join('');
  }

  /* ---------- speed + ladder ---------- */
  function speedHtml(d) {
    var t = d.t || [];
    var m = [
      ['To first appointment booked', t[0], t[1], t[2]],
      ['To the studio', t[3], t[4], t[5]],
      ['To the sale', t[6], t[7], t[8]]
    ];
    var miles = m.map(function (x) {
      return '<div class="j-mile"><small>' + x[0] + '</small><b>' + (x[3] ? days(x[1]) : '-') + '</b><span>' +
        (x[3] ? '1 in 4 take more than ' + days(x[2]) : 'No leads reached this yet') + '</span></div>';
    }).join('');
    var a = (d.a || []).slice().sort(function (p, q) { return p[0] - q[0]; });
    var maxN = a.reduce(function (mx, x) { return Math.max(mx, +x[1]); }, 0) || 1;
    var lad = a.map(function (x) {
      var k = +x[0], n = +x[1], b = +x[2];
      var lab = k === 0 ? 'Answered first time' : (k === 5 ? '5 attempts' : k + (k === 1 ? ' attempt' : ' attempts'));
      return '<div class="j-lrow"><span class="lab">' + lab + '</span><div class="j-bar"><i style="width:' + (n / maxN * 100) + '%"></i><em style="width:' + (b / maxN * 100) + '%"></em></div>' +
        '<span class="num">' + n0(n) + ' <small>· ' + pct(b, n) + ' booked</small></span></div>';
    }).join('');
    return '<div class="j-miles">' + miles + '</div><div class="j-ladder"><div class="j-lh"><b>When the first call goes unanswered.</b> Leads by how many no-response attempts they went through; ' +
      'the green part went on to book an appointment.</div>' + lad + '</div>';
  }

  /* ---------- channel scorecard ---------- */
  function scoreHtml(D) {
    var srcs = D.srcs.filter(function (s) { return s.n >= 10; });
    if (!srcs.length) srcs = D.srcs.slice();
    srcs = srcs.slice(0, 11).sort(function (a, b) { return (b.amt / b.n) - (a.amt / a.n); });
    var head = '<div class="j-tr h"><span>Source</span><span class="r">Leads</span><span>Studio, then sold</span><span class="r">Win</span><span class="r">Sold</span><span class="r">Per lead</span></div>';
    var body = srcs.map(function (s) {
      return '<div class="j-tr"><span class="c" title="' + esc(s.name) + '">' + esc(s.name) + '</span><span class="r">' + n0(s.n) + '</span>' +
        '<div class="j-fun" title="' + esc(pct(s.studio, s.n) + ' reached the studio, ' + pct(s.sold, s.n) + ' sold') + '"><i style="width:' + (s.studio / s.n * 100) + '%"></i><em style="width:' + (s.sold / s.n * 100) + '%"></em></div>' +
        '<span class="r">' + pct(s.sold, s.n) + '</span><span class="r">' + money(s.amt) + '</span><span class="v">' + money(s.amt / s.n) + '</span></div>';
    }).join('');
    return '<div class="j-tbl">' + head + body + '</div><div class="j-legend"><span><i style="background:#2F4858;opacity:.55"></i>Reached the studio</span>' +
      '<span><i style="background:#1B7A4E"></i>Sold</span><span>Sorted by sold dollars per lead</span></div>';
  }

  function build(d) {
    var D = shape(d);
    if (state.sel && !D.rows.some(function (r) { return r.src === state.sel; })) state.sel = null;
    var asof = d.asof ? new Date(d.asof + 'T12:00:00') : new Date();
    var asofNice = asof.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    var head = '';
    if (!D.total) return head + '<div class="j-empty">No leads match the filters. Open Filters and widen the dates.</div>';
    var selTxt = 'Click a source to follow its leads';
    if (state.sel) {
      var ss = { n: 0, studio: 0, sold: 0, amt: 0 };
      D.rows.forEach(function (r) { if (r.src === state.sel) { ss.n += r.n; if (r.s === 1) ss.studio += r.n; if (r.o === 'S') { ss.sold += r.n; ss.amt += r.amt; } } });
      selTxt = 'Showing <b>' + esc(state.sel) + '</b>: ' + n0(ss.n) + ' leads · ' + pct(ss.studio, ss.n) + ' to studio · ' + n0(ss.sold) + ' sold (' + money(ss.amt) +
        ') · click it again to show all';
    }
    var note = d.nopre ? '<div class="j-note"><b>' + n0(d.nopre) + '</b> of these leads were created before 2025, before status history was kept: they show as Not booked unless they reached the studio.</div>' : '';
    return head +
      '<div class="j-card j-river"><div class="j-chd"><span class="j-tag">Journey River</span><span class="j-sub"><b style="color:' + T.ink + '">' + n0(D.total) + '</b> leads created in the dates you picked (duplicates and junk left out), from their source to where they are now. Band width = leads; hover a band for the count.</span><span class="j-sel">' + selTxt + '</span></div>' +
      '<div class="j-caps" style="flex:none;position:relative;height:16px;margin:0 14px;font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:' + T.faint + '"></div>' +
      '<div class="j-svg" style="margin:2px 14px 10px"></div></div>' +
      '<div class="j-row"><div class="j-card"><div class="j-chd"><span class="j-tag">Speed to studio</span><span class="j-sub">Typical time from the lead coming in</span></div><div class="j-body">' + speedHtml(d) + '</div></div>' +
      '<div class="j-card"><div class="j-chd"><span class="j-tag">Channel scorecard</span><span class="j-sub">Which sources turn leads into sales</span></div><div class="j-body">' + scoreHtml(D) + '</div></div></div>' + note;
  }

  var raf = 0;
  function render() {
    if (raf) return;
    raf = (window.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(function () {
      raf = 0;
      if (!document.getElementById('icj-style')) {
        var s = document.createElement('style'); s.id = 'icj-style'; s.textContent = CSS; (document.head || document.documentElement).appendChild(s);
      }
      var root = document.getElementById('icj-root'); if (!root) return;
      var d = window.__icchJourney || {};
      root.innerHTML = build(d);
      var el = root.querySelector('.j-svg');
      if (el) {
        var D = shape(d);
        river(el, D);
        el.onclick = function (e) {
          var t = e.target; while (t && t !== el && !(t.getAttribute && t.getAttribute('data-src'))) t = t.parentNode;
          if (!t || t === el) return;
          var k = t.getAttribute('data-src'); state.sel = state.sel === k ? null : k; render();
        };
      }
    });
  }

  window.addEventListener('resize', render);
  window.ICCHJOURNEY = { __installed: true, render: render, version: 'icch-journey-v1.0.1' };
  render();
})();
