/*!
 * Inspired Closets LA - "2026 Goals" report page, rendered in JavaScript
 * ---------------------------------------------------------------------------
 * Repo    : https://github.com/sulaiman013/dax-with-js
 * Serve   : https://cdn.jsdelivr.net/gh/sulaiman013/dax-with-js@icla-goals-v1.0.4/icla/icla-goals.js
 * License : MIT
 *
 * Fourteen goal-vs-actual KPI tiles (Marye Silvers' 2026 goal framework),
 * grouped THIS YEAR / THIS MONTH / THIS WEEK, each with a progress meter,
 * a pace tick (where the goal says you should be today) and a status chip.
 *
 * DATA CONTRACT - window.__iclaGoals  (everything an INTEGER, locale-safe)
 * ---------------------------------------------------------------------------
 *   asof   'YYYY-MM-DD' (already ISO, safe to print)
 *   doy/diy   day of year / days in year          (pace for THIS YEAR)
 *   dom/dim   day of month / days in month        (pace for THIS MONTH)
 *   wde       days elapsed in Sunday-start week   (pace for THIS WEEK, of 7)
 *   revY/revM/revW    sold revenue, CENTS (by Original Project Sold Date -
 *                     the Salesforce Community standard)
 *   jobsY/jobsM/jobsW sold project counts
 *   faY/faM/faW       FIRST appointments (Is First Appointment = 1)
 *   leadsY/leadsW     new leads
 *   desM              distinct designers with an opportunity this month
 *   soldM/decM        Community closing inputs: sold-by-sold-date this month
 *                     / created this month excluding Dead Lead
 *   g: goals, same units:
 *      revY/revM/revW (cents), jobsY/jobsM/jobsW, faY/faW, leadsY,
 *      des, closeBp (>=, basis points), avgC (>=, cents), apdW (>=, per wk),
 *      l2aBp (>=, basis points)
 *
 * Derived here, never in DAX: closing % = soldM/decM, average sale =
 * revM/jobsM, appts/designer = faW/desM, lead->appt = faW/leadsW, every
 * pace ratio, every formatted string, every colour.
 *
 * SANDBOX NOTES
 * ---------------------------------------------------------------------------
 * HTML Content (standard) iframe: null origin, DOM replaced and scripts
 * re-run on every cross-filter/resize/refresh. Hence: install guard, style
 * injected only if absent, zero event listeners (static tiles; full-precision
 * values ride on title tooltips), renders coalesced via requestAnimationFrame.
 */
(function () {
  'use strict';

  if (window.ICGOALS && window.ICGOALS.__installed) {
    window.ICGOALS.render();
    return;
  }

  /* ── ICLA report theme tokens (Inspired_Closets_LA theme json) ────────── */
  var T = {
    ink: '#1A1D2E', sec: '#5C5F77', faint: '#9497AD',
    line: '#E3E5F0', ground: '#F7F8FB', card: '#FFFFFF',
    good: '#0FAF8E', goodTk: '#DCF4EE', goodTx: '#0B7A63',
    warn: '#E8A817', warnTk: '#FBEED2', warnTx: '#8F6606',
    bad:  '#E8524F', badTk:  '#FBDFDD', badTx:  '#B02F2C'
  };

  var CSS = [
    'html,body{height:100%;margin:0}',
    '#icg-root{background:', T.ground, ';color:', T.ink,
      ";font-family:'Segoe UI',system-ui,-apple-system,sans-serif;",
      'padding:22px 24px 16px;height:100%;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden}',
    '#icg-root *{box-sizing:border-box}',
    '.icg-head{display:flex;align-items:baseline;justify-content:space-between;gap:14px;',
      'flex-wrap:wrap;border-bottom:3px solid ', T.good, ';padding-bottom:14px;margin-bottom:20px}',
    '.icg-eyebrow{font-size:10.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:', T.good, ';margin-bottom:2px}',
    '.icg-title{font-size:24px;font-weight:700;letter-spacing:-.01em}',
    '.icg-title span{color:', T.faint, ';font-weight:400}',
    '.icg-asof{text-align:right;color:', T.sec, ';font-size:11.5px;line-height:1.5}',
    '.icg-asof b{color:', T.ink, ';font-weight:600}',
    '.icg-sec{margin-bottom:16px;flex:1;display:flex;flex-direction:column;min-height:0}',
    '.icg-sechead{display:flex;align-items:center;gap:9px;margin-bottom:10px}',
    '.icg-tag{font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:', T.good, '}',
    '.icg-win{font-size:11px;color:', T.faint, '}',
    '.icg-rule{flex:1;height:1px;background:', T.line, '}',
    '.icg-grid{flex:1;display:grid;grid-template-columns:repeat(5,1fr);grid-auto-rows:1fr;gap:14px;min-height:0}',
    '.icg-tile{background:', T.card, ';border:1px solid ', T.line, ';border-radius:10px;',
      'padding:15px 17px 15px;display:flex;flex-direction:column;gap:7px;min-width:0}',
    '.icg-hero{grid-column:span 2}',
    '.icg-label{font-size:11px;font-weight:600;color:', T.sec, '}',
    '.icg-value{margin-top:auto;font-size:clamp(22px,3.4vh,30px);font-weight:600;line-height:1.05;letter-spacing:-.01em;',
      "font-family:'Segoe UI',system-ui,sans-serif}",
    '.icg-hero .icg-value{font-size:clamp(38px,7.5vh,58px);font-weight:700}',
    '.icg-value small{font-size:.55em;color:', T.faint, ';font-weight:500}',
    '.icg-goal{font-size:11px;color:', T.sec, '}',
    '.icg-goal b{color:', T.ink, ';font-weight:600}',
    '.icg-meter{position:relative;height:8px;border-radius:4px;margin-top:auto}',
    '.icg-fill{position:absolute;top:0;bottom:0;left:0;border-radius:4px;min-width:2px}',
    '.icg-tick{position:absolute;top:-3px;bottom:-3px;width:2px;background:', T.ink, ';opacity:.5;border-radius:1px}',
    '.icg-foot{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:1px;min-height:22px}',
    '.icg-sub{font-size:10.5px;color:', T.faint, ';font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.icg-chip{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;',
      'padding:2px 8px;border-radius:999px;white-space:nowrap;flex:none}',
    '.icg-pips{display:flex;gap:8px;padding:9px 0 4px;margin-top:auto}',
    '.icg-pip{width:17px;height:17px;border-radius:50%;border:1.5px solid ', T.line, '}',
    '.icg-notes{flex:none;margin-top:2px;padding:12px 16px;background:', T.card, ';border:1px solid ', T.line,
      ';border-radius:8px;font-size:11px;color:', T.sec, ';line-height:1.65}',
    '.icg-notes b{color:', T.ink, '}',
    '@media(max-width:900px){.icg-grid{grid-template-columns:repeat(2,1fr)}}'
  ].join('');

  /* ── formatting (client side, locale via toLocaleString) ──────────────── */
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
  function pctBp(bp) { return (bp / 100).toFixed(1) + '%'; }

  function paceStatus(ratio) {
    if (ratio >= 0.95) return { k: 'good', g: '▲', t: 'On pace' };
    if (ratio >= 0.70) return { k: 'warn', g: '◆', t: 'Behind pace' };
    return { k: 'bad', g: '▼', t: 'Well behind' };
  }
  function threshStatus(ratio) {
    if (ratio >= 1)    return { k: 'good', g: '✓', t: 'Met' };
    if (ratio >= 0.85) return { k: 'warn', g: '◆', t: 'Close' };
    return { k: 'bad', g: '▼', t: 'Below target' };
  }
  function chip(st) {
    var col = st.k === 'good' ? [T.goodTx, T.goodTk] : st.k === 'warn' ? [T.warnTx, T.warnTk] : [T.badTx, T.badTk];
    return '<span class="icg-chip" style="color:' + col[0] + ';background:' + col[1] + '">' + st.g + ' ' + st.t + '</span>';
  }
  function meterCls(k) { return k === 'good' ? T.good : k === 'warn' ? T.warn : T.bad; }
  function meterTk(k)  { return k === 'good' ? T.goodTk : k === 'warn' ? T.warnTk : T.badTk; }

  /* tile: {label, valueHtml, titleAttr, goalHtml, att, tickPct, thresh, sub, hero, pips:{on,of}} */
  function tile(t) {
    var body = '';
    var foot = '';
    if (t.pips) {
      var st = t.pips.on >= t.pips.of
        ? { k: 'good', g: '✓', t: 'At target' }
        : { k: 'warn', g: '◆', t: (t.pips.of - t.pips.on) + ' short' };
      var pips = '';
      for (var i = 0; i < t.pips.of; i++) {
        pips += '<div class="icg-pip" style="' +
          (i < t.pips.on ? 'background:' + T.warn + ';border-color:' + T.warn : '') + '"></div>';
      }
      body = '<div class="icg-pips">' + pips + '</div>';
      foot = '<span class="icg-sub">' + (t.sub || '') + '</span>' + chip(st);
    } else {
      var st2 = t.thresh ? threshStatus(t.att) : paceStatus(t.tickPct > 0 ? t.att / t.tickPct : t.att);
      var fillPct = Math.max(0, Math.min(100, t.att * 100));
      var tickAt = t.thresh ? 100 : t.tickPct * 100;
      body = '<div class="icg-meter" style="background:' + meterTk(st2.k) + '">' +
        '<div class="icg-fill" style="width:' + fillPct + '%;background:' + meterCls(st2.k) + '"></div>' +
        '<div class="icg-tick" style="left:' + Math.min(99, tickAt) + '%"></div></div>';
      var sub = t.sub != null ? t.sub
        : t.thresh ? (t.att * 100).toFixed(0) + '% of target'
        : (t.att * 100).toFixed(1) + '% of goal · pace ' + Math.round(tickAt) + '%';
      foot = '<span class="icg-sub">' + sub + '</span>' + chip(st2);
    }
    return '<div class="icg-tile' + (t.hero ? ' icg-hero' : '') + '"' +
      (t.titleAttr ? ' title="' + t.titleAttr + '"' : '') + '>' +
      '<div class="icg-label">' + t.label + '</div>' +
      '<div class="icg-value">' + t.valueHtml + '</div>' +
      '<div class="icg-goal">Goal <b>' + t.goalHtml + '</b></div>' +
      body + '<div class="icg-foot">' + foot + '</div></div>';
  }

  function section(tag, win, tiles) {
    var cells = '';
    for (var i = 0; i < tiles.length; i++) cells += tile(tiles[i]);
    return '<div class="icg-sec"><div class="icg-sechead">' +
      '<span class="icg-tag">' + tag + '</span><span class="icg-win">' + win + '</span>' +
      '<div class="icg-rule"></div></div><div class="icg-grid">' + cells + '</div></div>';
  }

  function build(d) {
    var g = d.g || {};
    var yEl = d.diy ? d.doy / d.diy : 0;
    var mEl = d.dim ? d.dom / d.dim : 0;
    var wEl = d.wde / 7;

    var closingBp = d.decM > 0 ? Math.round(d.soldM / d.decM * 10000) : null;
    var avgC = d.jobsM > 0 ? Math.round(d.revM / d.jobsM) : null;
    var apd = d.desM > 0 ? d.faW / d.desM : null;
    var l2aBp = d.leadsW > 0 ? Math.round(d.faW / d.leadsW * 10000) : null;

    var mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var parts = String(d.asof || '').split('-');
    var asofNice = parts.length === 3
      ? mons[(+parts[1] || 1) - 1] + ' ' + (+parts[2]) + ', ' + parts[0] : String(d.asof || '');

    var year = section('This year', 'Jan 1 – ' + asofNice + ' · ' + Math.round(yEl * 100) + '% elapsed', [
      { hero: 1, label: 'Annual revenue', valueHtml: money(d.revY), titleAttr: moneyFull(d.revY),
        goalHtml: money(g.revY), att: g.revY ? d.revY / g.revY : 0, tickPct: yEl },
      { label: 'Jobs sold', valueHtml: num(d.jobsY), goalHtml: num(g.jobsY),
        att: g.jobsY ? d.jobsY / g.jobsY : 0, tickPct: yEl },
      { label: 'Appointments (first)', valueHtml: num(d.faY), goalHtml: num(g.faY),
        att: g.faY ? d.faY / g.faY : 0, tickPct: yEl },
      { label: 'New leads', valueHtml: num(d.leadsY), goalHtml: num(g.leadsY),
        att: g.leadsY ? d.leadsY / g.leadsY : 0, tickPct: yEl }
    ]);

    var month = section('This month', 'Day ' + d.dom + ' of ' + d.dim + ' · ' + Math.round(mEl * 100) + '% elapsed', [
      { label: 'Revenue', valueHtml: money(d.revM), titleAttr: moneyFull(d.revM),
        goalHtml: money(g.revM), att: g.revM ? d.revM / g.revM : 0, tickPct: mEl },
      { label: 'Jobs sold', valueHtml: num(d.jobsM), goalHtml: num(g.jobsM),
        att: g.jobsM ? d.jobsM / g.jobsM : 0, tickPct: mEl },
      { label: 'Sales designers', valueHtml: num(d.desM) + ' <small>of ' + num(g.des) + '</small>',
        goalHtml: num(g.des), pips: { on: d.desM, of: g.des }, sub: 'team active this month' },
      { label: 'Company closing %',
        valueHtml: closingBp == null ? '–' : pctBp(closingBp),
        goalHtml: '≥ ' + pctBp(g.closeBp), thresh: 1,
        att: closingBp == null ? 0 : closingBp / g.closeBp,
        sub: num(d.soldM) + ' sold ÷ ' + num(d.decM) + ' created' + (d.decM < 10 ? ' · small base' : '') },
      { label: 'Average sale',
        valueHtml: avgC == null ? '–' : money(avgC),
        titleAttr: avgC == null ? '' : moneyFull(avgC),
        goalHtml: '≥ $' + Math.round(g.avgC / 100).toLocaleString('en-US'), thresh: 1,
        att: avgC == null ? 0 : avgC / g.avgC }
    ]);

    var week = section('This week', 'Sunday start · day ' + d.wde + ' of 7', [
      { label: 'Revenue', valueHtml: money(d.revW), titleAttr: moneyFull(d.revW),
        goalHtml: money(g.revW), att: g.revW ? d.revW / g.revW : 0, tickPct: wEl },
      { label: 'Jobs sold', valueHtml: num(d.jobsW), goalHtml: num(g.jobsW),
        att: g.jobsW ? d.jobsW / g.jobsW : 0, tickPct: wEl },
      { label: 'Appointments (first)', valueHtml: num(d.faW), goalHtml: num(g.faW),
        att: g.faW ? d.faW / g.faW : 0, tickPct: wEl },
      { label: 'Appts per designer',
        valueHtml: apd == null ? '–' : apd.toFixed(1),
        goalHtml: '≥ ' + num(g.apdW), thresh: 1,
        att: apd == null ? 0 : apd / g.apdW,
        sub: num(d.faW) + ' first appts ÷ ' + num(d.desM) + ' designers' },
      { label: 'Lead → appt conversion',
        valueHtml: l2aBp == null ? '–' : pctBp(l2aBp),
        goalHtml: '≥ ' + pctBp(g.l2aBp), thresh: 1,
        att: l2aBp == null ? 0 : l2aBp / g.l2aBp,
        sub: num(d.faW) + ' of ' + num(d.leadsW) + ' leads · partial week' }
    ]);

    return '<div class="icg-head"><div>' +
      '<div class="icg-eyebrow">Inspired Closets · Los Angeles</div>' +
      '<div class="icg-title">2026 Goals <span>· goal vs. actual</span></div></div>' +
      '<div class="icg-asof">Data as of <b>' + asofNice + '</b><br>' +
      'Basis: sold date (Salesforce Community standard) · week starts Sunday</div></div>' +
      year + month + week +
      '<div class="icg-notes"><b>Definitions.</b> Sold $ and jobs count by Original Project Sold Date, matching the Salesforce Community. ' +
      'Closing % = sold in period ÷ created in period, excluding Dead Lead (Community formula). ' +
      'Average sale = sold $ ÷ jobs sold. Appointments = first appointments; leads and appointments count by their own dates. ' +
      'Pace mark (▏) = where the goal says you should be today.</div>';
  }

  /* ── idempotent plumbing ───────────────────────────────────────────────── */
  var queued = false;
  function render() {
    if (queued) return;
    queued = true;
    (window.requestAnimationFrame || window.setTimeout)(function () {
      queued = false;
      var root = document.getElementById('icg-root');
      if (!root) return;
      if (!document.getElementById('icg-style')) {
        var s = document.createElement('style');
        s.id = 'icg-style';
        s.textContent = CSS;
        document.head.appendChild(s);
      }
      var d = window.__iclaGoals;
      root.innerHTML = d ? build(d)
        : '<div style="padding:24px;color:' + T.faint + ';font-family:Segoe UI,sans-serif">Waiting for data…</div>';
    });
  }

  window.ICGOALS = { __installed: true, render: render, version: 'icla-goals-v1.0.4' };
  render();
})();
