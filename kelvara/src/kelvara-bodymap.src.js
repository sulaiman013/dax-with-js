/* Kelvara HSE body map, renderer.
   ---------------------------------------------------------------------------
   Runs inside the HTML Content visual's sandboxed iframe, which has a null
   origin. That rules out localStorage, sessionStorage and cookies: touching
   them throws rather than returning null, so all state lives on `window`.

   The visual replaces the whole document body every time the measure is
   re-evaluated, so this file must be safe to execute repeatedly. Definitions
   install once behind a guard; only boot() runs per evaluation.

   Nothing can be written back to the Power BI filter context from in here, so
   any interaction the user expects to filter something has to be satisfied
   from the payload alone. That is why the DAX ships grain rather than
   aggregates: region x severity x month, plus region x mechanism and
   region x role. Clicking a body region re-aggregates in the browser.

   Labels are baked (see build_runtime.py) and only numbers cross the DAX
   boundary, which removes string escaping from the hot path entirely. The one
   genuinely dynamic string, the filter caption, goes through the full escape
   chain on the DAX side.
*/
(function () {
  'use strict';

  var PALETTE = {
    bg: '#faf8f4', panel: '#fffdf9', ink: '#2e2a24', mute: '#8a8071',
    rule: '#e8e1d4', stroke: '#b9ab93', accent: '#96641a', accent2: '#c08a3e',
    good: '#5c7a52', warn: '#b4762a'
  };

  /* The design's own amber ramp, reused so the figure matches the artifact. */
  var RAMP = [[0, [250, 248, 244]], [0.2, [247, 233, 205]], [0.45, [238, 205, 148]],
              [0.7, [214, 160, 74]], [1, [150, 100, 26]]];

  function ramp(t) {
    if (!(t > 0)) return 'rgb(250,248,244)';
    if (t > 1) t = 1;
    for (var i = 0; i < RAMP.length - 1; i++) {
      var a = RAMP[i], b = RAMP[i + 1];
      if (t >= a[0] && t <= b[0]) {
        var k = (t - a[0]) / (b[0] - a[0] || 1);
        return 'rgb(' + [0, 1, 2].map(function (j) {
          return Math.round(a[1][j] + (b[1][j] - a[1][j]) * k);
        }).join(',') + ')';
      }
    }
    return 'rgb(150,100,26)';
  }

  function lum(rgb) {
    var m = /(\d+),(\d+),(\d+)/.exec(rgb);
    if (!m) return 255;
    return 0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3];
  }

  /* The character class uses \\u0022 rather than a literal quote. The measure
     builder strips comments with a string-aware scanner, and a bare quote in a
     regex literal reads to it as the start of a string, which desynchronises
     everything after it. build_dax.assert_safe enforces this. */
  function esc(s) {
    return String(s).replace(/[&<>\u0022]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function num(n) {
    return (n == null || n !== n) ? '—' : Math.round(n).toLocaleString('en-US');
  }

  function dec(n, p) {
    return (n == null || n !== n) ? '—' : n.toFixed(p == null ? 2 : p);
  }

  /* ---------------------------------------------------------------- state */

  /* Selections live on window, not in storage: the iframe has a null origin
     and touching localStorage there throws rather than returning null.
     Multi-select dimensions are objects used as sets; empty means "all". */
  var KV = window.__KV || (window.__KV = {
    state: { region: null, sev: null, site: {}, bu: {}, shift: {}, wclass: {}, year: {} },
    frame: 0
  });

  function anyOn(set) {
    for (var k in set) if (set[k]) return true;
    return false;
  }

  function passes(set, key) {
    return !anyOn(set) || !!set[key];
  }

  /* ------------------------------------------------------------ aggregate */

  /* f stride 10, one row per incident:
       regionKey, sevKey, ymKey, siteKey, shiftKey, wclassKey,
       mechKey, roleKey, daysAway, daysRestricted
     h stride 5, exposure:
       ymKey, siteKey, shiftKey, wclassKey, hours

     Row grain rather than pre-aggregated, because the filter bar is part of
     this same file: aggregating in DAX would fix the filter set at build time,
     which is the thing being avoided. */

  var F = 10, HH = 5;

  function aggregate(p, st) {
    var f = p.f || [], h = p.h || [];
    var out = {
      cases: 0, recordable: 0, dart: 0, lost: 0, firstAid: 0,
      daysAway: 0, daysRestricted: 0, hours: 0,
      byRegion: {}, bySev: {}, byMonth: {}, byMech: {}, byRole: {}, bySite: {},
      months: [], maxRegion: 0
    };

    var buOf = window.KV_SITE_BU || {};

    /* Hours are exposure, not injury. They honour every dimension the filter
       bar exposes EXCEPT body region and severity, because neither is a
       property of exposure. If a region selection shrank the denominator, a
       region would appear to have a worse TRIR purely for being selected. */
    var monthSet = {};
    for (var i = 0; i < h.length; i += HH) {
      var hy = h[i], hs = h[i + 1];
      if (!passes(st.year, Math.floor(hy / 100)) || !passes(st.site, hs)) continue;
      if (!passes(st.bu, buOf[hs])) continue;
      if (!passes(st.shift, h[i + 2]) || !passes(st.wclass, h[i + 3])) continue;
      monthSet[hy] = true;
      out.hours += h[i + 4];
    }

    for (var j = 0; j < f.length; j += F) {
      var rk = f[j], sk = f[j + 1], ymk = f[j + 2], site = f[j + 3];
      var da = f[j + 8], dr = f[j + 9];

      /* Bar filters first. These apply to everything, including the map. */
      if (!passes(st.year, Math.floor(ymk / 100)) || !passes(st.site, site)) continue;
      if (!passes(st.bu, buOf[site])) continue;
      if (!passes(st.shift, f[j + 4]) || !passes(st.wclass, f[j + 5])) continue;

      monthSet[ymk] = true;
      var sev = window.KV_SEV[sk] || {};
      var keepRegion = st.region == null || st.region === rk;
      var keepSev = st.sev == null || st.sev === sk;

      /* The map itself always shows every region, otherwise selecting one
         would blank the other twenty-six and the map would stop being a map.
         It respects a severity selection but never a region selection. */
      if (keepSev) out.byRegion[rk] = (out.byRegion[rk] || 0) + 1;
      if (!keepRegion) out.bySev[sk] = out.bySev[sk] || 0;
      if (!keepRegion || !keepSev) continue;

      out.cases += 1;
      out.daysAway += da;
      out.daysRestricted += dr;
      if (sev.rec) out.recordable += 1;
      if (sev.dart) out.dart += 1;
      if (sev.lost) out.lost += 1;
      if (!sev.rec) out.firstAid += 1;
      out.bySev[sk] = (out.bySev[sk] || 0) + 1;
      out.byMonth[ymk] = (out.byMonth[ymk] || 0) + 1;
      out.bySite[site] = (out.bySite[site] || 0) + 1;
      out.byMech[f[j + 6]] = (out.byMech[f[j + 6]] || 0) + 1;
      out.byRole[f[j + 7]] = (out.byRole[f[j + 7]] || 0) + 1;
    }

    out.months = Object.keys(monthSet).map(Number).sort(function (a, b) { return a - b; });

    /* OIICS has three codes that no figure can carry: multiple body parts,
       body systems, and nonclassifiable. About one case in forty lands there.
       Dropping them silently would leave the figure totalling less than the
       KPI beside it, which is exactly the kind of quiet discrepancy that costs
       a safety report its credibility. Count them out loud instead. */
    out.unmapped = {};
    out.unmappedTotal = 0;
    for (var rk2 in out.byRegion) {
      var meta = window.KV_REGIONS[rk2];
      if (!meta || !meta.svg) {
        out.unmapped[rk2] = out.byRegion[rk2];
        out.unmappedTotal += out.byRegion[rk2];
        continue;
      }
      if (out.byRegion[rk2] > out.maxRegion) out.maxRegion = out.byRegion[rk2];
    }

    var H = out.hours || 0;
    out.trir = H ? (out.recordable * 200000) / H : null;
    out.dartRate = H ? (out.dart * 200000) / H : null;
    out.ltifr = H ? (out.lost * 1000000) / H : null;
    out.severityRate = H ? (out.daysAway * 200000) / H : null;
    return out;
  }

  /* --------------------------------------------------------------- panels */

  function bars(title, rows, total, colour) {
    if (!rows.length) {
      return '<div class="kv-panel"><h3>' + esc(title) +
             '</h3><p class="kv-empty">No cases in the current selection.</p></div>';
    }
    var max = rows[0][1] || 1;
    var html = '<div class="kv-panel"><h3>' + esc(title) + '</h3><ul class="kv-bars">';
    rows.forEach(function (row) {
      var pct = total ? (row[1] / total) * 100 : 0;
      html += '<li><span class="kv-bl">' + esc(row[0]) + '</span>' +
              '<span class="kv-bt"><i style="width:' + ((row[1] / max) * 100).toFixed(1) +
              '%;background:' + colour + '"></i></span>' +
              '<span class="kv-bv">' + num(row[1]) +
              '<em>' + dec(pct, 0) + '%</em></span></li>';
    });
    return html + '</ul></div>';
  }

  function topRows(map, lookup, n) {
    return Object.keys(map)
      .map(function (k) { return [(lookup[k] || {}).name || lookup[k] || ('#' + k), map[k]]; })
      .sort(function (a, b) { return b[1] - a[1]; })
      .slice(0, n);
  }

  /* ---------------------------------------------------------------- trend */

  function trend(agg) {
    /* The viewBox is sized to the box the panel actually gives this chart, so
       one user unit is one CSS pixel and the tick text renders at its stated
       size. The previous 1660-wide viewBox stretched with
       preserveAspectRatio="none" into a 520px column, which squashed every
       label horizontally to about a third of its width and made the axis
       unreadable. */
    var W = 1078, H = 176, L = 38, R = 12, T = 12, B = 28;
    var ms = agg.months;
    if (ms.length < 2) {
      return '<div class="kv-panel kv-trend"><h3>Monthly cases</h3>' +
             '<p class="kv-empty">At least two months are needed for a trend.</p></div>';
    }

    var vals = ms.map(function (m) { return agg.byMonth[m] || 0; });
    var max = Math.max.apply(null, vals) || 1;
    var stepX = (W - L - R) / (ms.length - 1);
    var y = function (v) { return H - B - (v / max) * (H - T - B); };
    var pts = vals.map(function (v, i) { return [L + i * stepX, y(v)]; });

    var line = pts.map(function (p, i) {
      return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
    }).join('');
    var area = line + 'L' + pts[pts.length - 1][0].toFixed(1) + ' ' + (H - B) +
               'L' + pts[0][0].toFixed(1) + ' ' + (H - B) + 'Z';

    /* Thin the axis to whole labels rather than drawing every month and
       letting them overlap into a grey smear. */
    var every = Math.max(1, Math.ceil(ms.length / 12));
    var ticks = '';
    ms.forEach(function (m, i) {
      if (i % every) return;
      var lab = window.KV_MONTHS[m] || String(m);
      ticks += '<text x="' + (L + i * stepX).toFixed(1) + '" y="' + (H - 12) +
               '" class="kv-tick">' + esc(lab) + '</text>';
    });

    /* Two gridlines and a scale, so the shape can be read as a quantity. */
    var grid = '';
    [0, 0.5, 1].forEach(function (t) {
      var gy = y(max * t);
      grid += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + gy.toFixed(1) +
              '" y2="' + gy.toFixed(1) + '" stroke="#efe9dd" stroke-width="1"/>' +
              '<text x="' + (L - 6) + '" y="' + (gy + 3.5).toFixed(1) +
              '" class="kv-tick" text-anchor="end">' + num(max * t) + '</text>';
    });

    var dots = pts.map(function (p, i) {
      return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) +
             '" r="2.6"><title>' + esc(window.KV_MONTHS[ms[i]] || ms[i]) + ': ' +
             num(vals[i]) + ' cases</title></circle>';
    }).join('');

    return '<div class="kv-panel kv-trend"><h3>Monthly cases' +
           (KV.state.region != null ? ', ' + esc(regionName(KV.state.region)) : '') +
           '</h3><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' +
           grid + '<path d="' + area + '" fill="rgba(150,100,26,.10)"/>' +
           '<path d="' + line + '" fill="none" stroke="' + PALETTE.accent +
           '" stroke-width="1.8" stroke-linejoin="round"/>' +
           '<g fill="' + PALETTE.accent + '">' + dots + '</g>' + ticks + '</svg></div>';
  }

  function regionName(key) {
    var r = window.KV_REGIONS[key];
    return r ? r.name : ('Region ' + key);
  }

  /* ----------------------------------------------------------- body figure */

  function figure(agg) {
    var vb = window.BODY_VIEWBOX, shapes = window.BODY_SHAPES;
    var labels = window.BODY_LABELS, detail = window.BODY_DETAIL, Z = window.BODY_Z;

    /* svgId -> case count, summed over the region keys that share an svgId
       (left and right of a bilateral region collapse onto one drawing). */
    var bySvg = {};
    for (var key in agg.byRegion) {
      var meta = window.KV_REGIONS[key];
      if (!meta || !meta.svg) continue;
      bySvg[meta.svg] = (bySvg[meta.svg] || 0) + agg.byRegion[key];
    }
    var max = 0;
    for (var s in bySvg) if (bySvg[s] > max) max = bySvg[s];

    var body = '', lab = '', det = '';
    detail.forEach(function (it) {
      det += '<path d="' + it.d + '"' + (it.tf ? ' transform="' + it.tf + '"' : '') +
             ' fill="none" stroke="#c9bfae" stroke-width=".8" stroke-linecap="round"/>';
    });

    var selectedSvg = KV.state.region != null &&
      window.KV_REGIONS[KV.state.region] ? window.KV_REGIONS[KV.state.region].svg : null;

    Z.forEach(function (sid) {
      var n = bySvg[sid] || 0;
      var t = max ? Math.pow(n / max, 0.55) : 0;
      var fill = ramp(t);
      var dim = selectedSvg && selectedSvg !== sid;
      var keys = window.KV_SVG_TO_KEY[sid] || [];
      var name = keys.length ? regionName(keys[0]) : sid;

      ['front', 'back'].forEach(function (view) {
        (shapes[view + '.' + sid] || []).forEach(function (it) {
          body += '<path d="' + it.d + '"' + (it.tf ? ' transform="' + it.tf + '"' : '') +
                  ' fill="' + fill + '" stroke="' +
                  (selectedSvg === sid ? PALETTE.ink : '#b9ab93') +
                  '" stroke-width="' + (selectedSvg === sid ? 2 : 1) +
                  '" stroke-linejoin="round" data-region="' + sid +
                  '" data-view="' + view + '" data-key="' + view + '.' + sid +
                  '" data-cases="' + n + '"' + (dim ? ' opacity=".38"' : '') +
                  '><title>' + esc(name) + ': ' + num(n) + ' cases</title></path>';
        });
        (labels[view + '.' + sid] || []).forEach(function (p) {
          var white = lum(fill) < 140;
          lab += '<text x="' + p[0] + '" y="' + p[1] + '" text-anchor="middle" ' +
                 'font-size="10.5" fill="' + (white ? '#ffffff' : '#3f2f14') +
                 '" pointer-events="none" paint-order="stroke" stroke="' +
                 (white ? '#5a3c0f' : '#faf8f4') + '" stroke-width="2.4"' +
                 (dim ? ' opacity=".38"' : '') + ' data-label="' + view + '.' + sid +
                 '">' + esc(name) + '</text>';
        });
      });
    });

    return '<svg id="kv-figure" viewBox="' + vb + '" role="img" ' +
           'aria-label="Human body map, injuries by body region">' +
           '<text x="170" y="684" class="kv-cap">FRONT</text>' +
           '<text x="540" y="684" class="kv-cap">BACK</text>' +
           '<g>' + body + '</g><g pointer-events="none">' + det + '</g>' +
           '<g pointer-events="none">' + lab + '</g></svg>';
  }

  /* The cases the figure cannot carry, stated under it and selectable, so the
     shaded regions plus this strip always add up to the headline count. */
  function unmapped(agg) {
    if (!agg.unmappedTotal) return '';
    var keys = Object.keys(agg.unmapped).sort(function (a, b) {
      return agg.unmapped[b] - agg.unmapped[a];
    });
    return '<div class="kv-unmapped"><span class="kv-ul">Not localised, ' +
      num(agg.unmappedTotal) + ' cases</span>' +
      keys.map(function (k) {
        return '<button data-region-key="' + k + '" class="kv-uchip' +
               (KV.state.region === +k ? ' on' : '') + '">' +
               esc(regionName(k)) + ' <b>' + num(agg.unmapped[k]) + '</b></button>';
      }).join('') + '</div>';
  }

  /* ----------------------------------------------------------- filter bar */

  /* Drawn here rather than by native Power BI slicers. A native slicer would
     work, since the measure is evaluated in filter context, but it would sit
     outside the rendered surface. These slice the shipped rows instead, which
     also means a click repaints in one frame with no query round trip. */

  function group(key, label, entries, sel) {
    var chips = entries.map(function (e) {
      var on = !!sel[e[0]];
      return '<button class="kv-f' + (on ? ' on' : '') + '" data-fk="' + key +
             '" data-fv="' + esc(e[0]) + '" aria-pressed="' + on + '">' +
             esc(e[1]) + '</button>';
    }).join('');
    return '<div class="kv-fg"><span class="kv-fl">' + esc(label) + '</span>' +
           '<div class="kv-fc">' + chips + '</div></div>';
  }

  function filterBar(p, agg) {
    var st = KV.state;
    var siteKeys = Object.keys(window.KV_SITE).map(Number).sort(function (a, b) {
      return (window.KV_SITE[a] || '').localeCompare(window.KV_SITE[b] || '');
    });
    /* Years come from the unfiltered payload, so selecting one never removes
       the chip you would need to deselect it. */
    var years = {};
    for (var i = 0; i < (p.h || []).length; i += HH) years[Math.floor(p.h[i] / 100)] = true;

    /* Two EXPLICIT rows rather than flex-wrap. Twenty chips do not fit on one
       line at 1920, and letting them wrap makes the bar's height depend on the
       data, which then pushes the map off the bottom of a canvas that cannot
       scroll. Fixed rows keep the height constant whatever is selected. */
    var row1 =
      group('site', 'Site', siteKeys.map(function (k) {
        return [k, window.KV_SITE[k]];
      }), st.site);

    var row2 =
      group('bu', 'Business unit', (window.KV_BU || []).map(function (b) {
        return [b, b];
      }), st.bu) +
      group('shift', 'Shift', Object.keys(window.KV_SHIFT).map(function (k) {
        return [k, window.KV_SHIFT[k]];
      }), st.shift) +
      group('wclass', 'Worker', Object.keys(window.KV_WCLASS).map(function (k) {
        return [k, window.KV_WCLASS[k]];
      }), st.wclass) +
      group('year', 'Year', Object.keys(years).sort().map(function (y) {
        return [y, y];
      }), st.year);

    var any = ['site', 'bu', 'shift', 'wclass', 'year'].some(function (k) {
      return anyOn(st[k]);
    }) || st.region != null || st.sev != null;

    return '<div class="kv-bar">' +
      '<div class="kv-brow">' + row1 +
        '<button class="kv-reset' + (any ? '' : ' off') + '" data-clear="1">' +
        (any ? 'Clear all filters' : 'No filters applied') + '</button></div>' +
      '<div class="kv-brow">' + row2 + '</div></div>';
  }

  /* ------------------------------------------------------------------ KPI */

  function kpis(agg, meta) {
    var reportable = agg.hours >= (meta.minHours || 0);
    var cards = [
      ['Cases', num(agg.cases), 'all severities'],
      ['Recordable', num(agg.recordable), dec(agg.cases ? (agg.recordable / agg.cases) * 100 : 0, 0) + '% of cases'],
      ['TRIR', reportable ? dec(agg.trir) : '—', 'per 200,000 hours'],
      ['DART rate', reportable ? dec(agg.dartRate) : '—', 'per 200,000 hours'],
      ['Days away', num(agg.daysAway), num(agg.lost) + ' lost-time cases'],
      ['Severity rate', reportable ? dec(agg.severityRate, 1) : '—', 'days per 200,000 hours']
    ];
    return '<div class="kv-kpis">' + cards.map(function (c) {
      return '<div class="kv-kpi"><span class="kv-kl">' + esc(c[0]) +
             '</span><strong>' + c[1] + '</strong><span class="kv-ks">' +
             esc(c[2]) + '</span></div>';
    }).join('') + '</div>';
  }

  /* --------------------------------------------------------------- render */

  function paint(root, p) {
    var agg = aggregate(p, KV.state);
    var meta = p.meta || {};

    var chip = '';
    if (KV.state.region != null || KV.state.sev != null) {
      var bits = [];
      if (KV.state.region != null) bits.push(regionName(KV.state.region));
      if (KV.state.sev != null) bits.push((window.KV_SEV[KV.state.sev] || {}).name || '');
      chip = '<button class="kv-chip" data-clear="1">' + esc(bits.join(' · ')) +
             ' <span aria-hidden="true">×</span></button>';
    }

    var sevRows = Object.keys(window.KV_SEV).map(function (k) {
      return { k: +k, name: window.KV_SEV[k].name, n: agg.bySev[k] || 0 };
    }).filter(function (r) { return r.n > 0; })
      .sort(function (a, b) { return b.n - a.n; });

    var sevHtml = '<div class="kv-panel"><h3>Severity mix</h3><ul class="kv-bars kv-sev">' +
      (sevRows.length ? sevRows.map(function (r) {
        var pct = agg.cases ? (r.n / agg.cases) * 100 : 0;
        var on = KV.state.sev === r.k;
        return '<li data-sev="' + r.k + '" class="' + (on ? 'on' : '') + '">' +
               '<span class="kv-bl">' + esc(r.name) + '</span>' +
               '<span class="kv-bt"><i style="width:' + pct.toFixed(1) +
               '%;background:' + PALETTE.accent2 + '"></i></span>' +
               '<span class="kv-bv">' + num(r.n) + '<em>' + dec(pct, 0) + '%</em></span></li>';
      }).join('') : '<li class="kv-empty">No cases.</li>') + '</ul></div>';

    root.innerHTML =
      '<div class="kv-head">' +
        '<div><h1>' + esc(meta.title || 'Injury site surveillance') + '</h1>' +
        '<p>' + esc(meta.caption || '') + '</p></div>' +
        '<div class="kv-head-r">' + chip +
        '<span class="kv-through">Data through ' + esc(meta.through || '') + '</span></div>' +
      '</div>' +
      filterBar(p, agg) +
      kpis(agg, meta) +
      '<div class="kv-body">' +
        '<div class="kv-map"><div class="kv-maphead"><h3>Injury site</h3>' +
          '<span class="kv-hint">' +
          (KV.state.region != null ? 'Showing ' + esc(regionName(KV.state.region))
                                   : 'Select a body region to filter') +
          '</span></div>' + figure(agg) +
          '<div class="kv-legend"><span>0</span>' +
          [0, .2, .4, .6, .8, 1].map(function (t) {
            return '<i style="background:' + ramp(t) + '"></i>';
          }).join('') + '<span>' + num(agg.maxRegion) + ' cases</span></div>' +
          unmapped(agg) +
        '</div>' +
        '<div class="kv-side kv-col2">' + sevHtml +
          bars('Cases by site', topRows(agg.bySite, window.KV_SITE, 8), agg.cases, PALETTE.warn) +
        '</div>' +
        '<div class="kv-side kv-col3">' +
          bars('Top mechanisms', topRows(agg.byMech, window.KV_MECH, 8), agg.cases, PALETTE.accent) +
          bars('Most exposed roles', topRows(agg.byRole, window.KV_ROLE, 8), agg.cases, PALETTE.good) +
        '</div>' +
        trend(agg) +
      '</div>';
  }

  function schedule(root, p) {
    if (KV.frame) return;
    KV.frame = requestAnimationFrame(function () {
      KV.frame = 0;
      paint(root, p);
    });
  }

  /* ------------------------------------------------------------------ boot */

  KV.boot = function () {
    var root = document.getElementById('kv-root');
    var p = window.__kvBody;
    if (!root || !p) return;

    /* Wire once per root element. The visual builds a new root on every
       re-evaluation, so this flag lives on the element, not on window. */
    if (!root.__kvWired) {
      root.__kvWired = true;
      root.addEventListener('click', function (e) {
        var clear = e.target.closest('[data-clear]');
        if (clear) {
          KV.state.region = null;
          KV.state.sev = null;
          ['site', 'bu', 'shift', 'wclass', 'year'].forEach(function (k) {
            KV.state[k] = {};
          });
          return schedule(root, window.__kvBody);
        }
        var fchip = e.target.closest('[data-fk]');
        if (fchip) {
          var fk = fchip.getAttribute('data-fk');
          var fv = fchip.getAttribute('data-fv');
          /* Keys arrive from the DOM as strings. The payload holds numbers, so
             site/shift/worker comparisons must be coerced or every chip would
             silently match nothing. Business unit and year stay strings. */
          var kk = (fk === 'site' || fk === 'shift' || fk === 'wclass' || fk === 'year')
            ? Number(fv) : fv;
          if (KV.state[fk][kk]) delete KV.state[fk][kk];
          else KV.state[fk][kk] = true;
          return schedule(root, window.__kvBody);
        }
        var uchip = e.target.closest('[data-region-key]');
        if (uchip) {
          var uk = +uchip.getAttribute('data-region-key');
          KV.state.region = KV.state.region === uk ? null : uk;
          return schedule(root, window.__kvBody);
        }
        var sevLi = e.target.closest('[data-sev]');
        if (sevLi) {
          var sk = +sevLi.getAttribute('data-sev');
          KV.state.sev = KV.state.sev === sk ? null : sk;
          return schedule(root, window.__kvBody);
        }
        var path = e.target.closest('path[data-region]');
        if (path) {
          var keys = window.KV_SVG_TO_KEY[path.getAttribute('data-region')] || [];
          var rk = keys[0];
          if (rk != null) {
            KV.state.region = KV.state.region === rk ? null : rk;
            schedule(root, window.__kvBody);
          }
        }
      });
      root.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          KV.state.region = null;
          KV.state.sev = null;
          ['site', 'bu', 'shift', 'wclass', 'year'].forEach(function (k) {
            KV.state[k] = {};
          });
          schedule(root, window.__kvBody);
        }
      });
    }

    /* A region that vanished from the payload after a slicer change must not
       leave the visual filtered to nothing. */
    if (KV.state.region != null) {
      var seen = false, f = p.f || [];
      for (var i = 0; i < f.length; i += 6) {
        if (f[i] === KV.state.region) { seen = true; break; }
      }
      if (!seen) KV.state.region = null;
    }

    paint(root, p);
  };

  KV.boot();
})();
