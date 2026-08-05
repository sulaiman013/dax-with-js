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
    state: {
      region: null, sev: null,
      site: {}, bu: {}, shift: {}, wclass: {}, year: {}, mech: {}, role: {}, month: {}
    },
    /* 'map' is the reading surface: figure, KPIs, explanation. 'detail' is
       reached by right-clicking a region and carries the breakdowns. A real
       Power BI drill-through is impossible here, because that needs the visual
       to build selection identities and hand one to the host, which HTML
       Content never does. Swapping views inside the one visual gives the same
       journey without pretending to a mechanism we do not have. */
    view: 'map',
    railOpen: false,
    frame: 0
  });

  /* Every set-valued dimension, in one place. Used by clear-all, by the
     key-coercion in the click handler and by the "any filter active" test, so
     adding a filterable panel means touching this list and nothing else. */
  var SETS = ['site', 'bu', 'shift', 'wclass', 'year', 'mech', 'role', 'month'];
  var NUMERIC_SETS = { site: 1, shift: 1, wclass: 1, year: 1, mech: 1, role: 1, month: 1 };

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
      allMonths: {},
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
      if (!passes(st.year, Math.floor(hy / 100)) || !passes(st.month, hy)) continue;
      if (!passes(st.site, hs)) continue;
      if (!passes(st.bu, buOf[hs])) continue;
      if (!passes(st.shift, h[i + 2]) || !passes(st.wclass, h[i + 3])) continue;
      monthSet[hy] = true;
      out.hours += h[i + 4];
    }

    /* Cross-highlighting, the way a native visual behaves: a panel ignores its
       OWN selection and honours every other one. Click "Welder" and the roles
       panel still lists every role with Welder marked, while the map, the KPIs
       and the other panels narrow to Welder. Without the self-exclusion, one
       click would blank the panel you just clicked and leave you no way back
       except the clear button. */
    for (var j = 0; j < f.length; j += F) {
      var rk = f[j], sk = f[j + 1], ymk = f[j + 2], site = f[j + 3];
      var mech = f[j + 6], role = f[j + 7], da = f[j + 8], dr = f[j + 9];

      /* Dimensions with no panel of their own: they gate everything. */
      if (!passes(st.year, Math.floor(ymk / 100))) continue;
      if (!passes(st.bu, buOf[site])) continue;
      var pMonth = passes(st.month, ymk);
      if (!passes(st.shift, f[j + 4]) || !passes(st.wclass, f[j + 5])) continue;

      var pSite = passes(st.site, site);
      var pSev = st.sev == null || st.sev === sk;
      var pRegion = st.region == null || st.region === rk;
      var pMech = passes(st.mech, mech);
      var pRole = passes(st.role, role);

      if (pSite && pSev && pRegion && pMech && pRole && pMonth) monthSet[ymk] = true;

      if (pSite && pSev && pMech && pRole && pMonth) out.byRegion[rk] = (out.byRegion[rk] || 0) + 1;
      if (pSite && pRegion && pMech && pRole && pMonth) out.bySev[sk] = (out.bySev[sk] || 0) + 1;
      if (pSev && pRegion && pMech && pRole && pMonth) out.bySite[site] = (out.bySite[site] || 0) + 1;
      if (pSite && pSev && pRegion && pRole && pMonth) out.byMech[mech] = (out.byMech[mech] || 0) + 1;
      if (pSite && pSev && pRegion && pMech && pMonth) out.byRole[role] = (out.byRole[role] || 0) + 1;
      /* The trend keeps every month on screen so a selected month can be seen
         in context and deselected; it honours everything except itself. */
      if (pSite && pSev && pRegion && pMech && pRole) {
        out.byMonth[ymk] = (out.byMonth[ymk] || 0) + 1;
        out.allMonths[ymk] = true;
      }

      if (!(pSite && pSev && pRegion && pMech && pRole && pMonth)) continue;

      var sev = window.KV_SEV[sk] || {};
      out.cases += 1;
      out.daysAway += da;
      out.daysRestricted += dr;
      if (sev.rec) out.recordable += 1;
      if (sev.dart) out.dart += 1;
      if (sev.lost) out.lost += 1;
      if (!sev.rec) out.firstAid += 1;
      /* byMonth is counted ONLY in the self-excluded block above. Counting it
         here as well double-counted every month whenever no month filter was
         active: the narrative halves summed to twice the case count. */
    }

    /* Exposure has no region, severity, mechanism or job-role grain, so those
       four filters cannot narrow the denominator. Say so on the rate cards
       rather than printing a rate that silently mixes a filtered numerator
       with an unfiltered one. */
    out.partialDenominator =
      st.region != null || st.sev != null || anyOn(st.mech) || anyOn(st.role);

    out.months = Object.keys(out.allMonths).map(Number)
      .sort(function (a, b) { return a - b; });
    if (!out.months.length) {
      out.months = Object.keys(monthSet).map(Number).sort(function (a, b) { return a - b; });
    }

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

  /* `key` names the state set this panel drives. Rows carry data-fk/data-fv,
     which is the same contract the filter-bar chips use, so one delegated
     handler on the root serves both and there is no second code path to keep
     in step. */
  /* `total` is the panel's OWN universe, not the page's case count. A panel
     that excludes its own selection holds rows outside the current filter, so
     dividing by the filtered total made the clicked row read 100% and its
     neighbours 97%, which is nonsense: those cases are not in the selection. */
  function bars(title, rows, total, colour, key) {
    if (!rows.length) {
      return '<div class="kv-panel"><h3>' + esc(title) +
             '</h3><p class="kv-empty">No cases in the current selection.</p></div>';
    }
    var sel = (key && KV.state[key]) || {};
    var max = rows[0][2] || 1;
    var html = '<div class="kv-panel"><h3>' + esc(title) +
               (key ? '<span class="kv-h3n">click to filter</span>' : '') +
               '</h3><ul class="kv-bars' + (key ? ' kv-click' : '') + '">';
    rows.forEach(function (row) {
      var pct = total ? (row[2] / total) * 100 : 0;
      var on = !!sel[row[0]];
      html += '<li' + (key ? ' data-fk="' + key + '" data-fv="' + esc(row[0]) +
              '" role="button" tabindex="0" aria-pressed="' + on + '"' : '') +
              (on ? ' class="on"' : '') + ' title="' + esc(row[1]) + ': ' +
              num(row[2]) + ' cases">' +
              '<span class="kv-bl">' + esc(row[1]) + '</span>' +
              '<span class="kv-bt"><i style="width:' + ((row[2] / max) * 100).toFixed(1) +
              '%;background:' + colour + '"></i></span>' +
              '<span class="kv-bv">' + num(row[2]) +
              '<em>' + dec(pct, 0) + '%</em></span></li>';
    });
    return html + '</ul></div>';
  }

  /* [key, label, count], sorted, top n. The key is kept so a row can drive a
     selection; carrying only the label would mean matching on display text. */
  function sumOf(map) {
    var t = 0;
    for (var k in map) t += map[k];
    return t;
  }

  function topRows(map, lookup, n) {
    return Object.keys(map)
      .map(function (k) {
        var v = lookup[k];
        return [k, (v && v.name) || v || ('#' + k), map[k]];
      })
      .sort(function (a, b) { return b[2] - a[2]; })
      .slice(0, n);
  }

  /* ---------------------------------------------------------------- trend */

  function trend(agg) {
    /* Sized to the box the panel gives it, so one user unit is one CSS pixel
       and the tick text renders at its stated size. */
    var W = 512, H = 186, L = 34, R = 10, T = 12, B = 28;
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

    /* Geometry the hover handler needs. Kept on KV so a mousemove can find the
       nearest point without re-rendering, which at 60Hz would be absurd. */
    KV.trend = { months: ms, vals: vals, L: L, R: R, W: W, H: H, T: T, B: B,
                 step: stepX, max: max };

    var line = pts.map(function (p2, i) {
      return (i ? 'L' : 'M') + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
    }).join('');
    var area = line + 'L' + pts[pts.length - 1][0].toFixed(1) + ' ' + (H - B) +
               'L' + pts[0][0].toFixed(1) + ' ' + (H - B) + 'Z';

    var sel = KV.state.month;
    var anySel = anyOn(sel);

    /* Shade the selected months so a range reads as a band rather than as a
       row of separately highlighted dots. */
    var bands = '';
    if (anySel) {
      ms.forEach(function (m, i) {
        if (!sel[m]) return;
        bands += '<rect class="kv-tband" x="' + (L + (i - 0.5) * stepX).toFixed(1) +
                 '" y="' + T + '" width="' + stepX.toFixed(1) +
                 '" height="' + (H - T - B) + '"/>';
      });
    }

    var every = Math.max(1, Math.ceil(ms.length / 5));
    var ticks = '';
    ms.forEach(function (m, i) {
      if (i % every) return;
      ticks += '<text x="' + (L + i * stepX).toFixed(1) + '" y="' + (H - 12) +
               '" class="kv-tick">' + esc(window.KV_MONTHS[m] || m) + '</text>';
    });

    var grid = '';
    [0, 0.5, 1].forEach(function (t) {
      var gy = y(max * t);
      grid += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + gy.toFixed(1) +
              '" y2="' + gy.toFixed(1) + '" stroke="#efe9dd" stroke-width="1"/>' +
              '<text x="' + (L - 6) + '" y="' + (gy + 3.5).toFixed(1) +
              '" class="kv-tick" text-anchor="end">' + num(max * t) + '</text>';
    });

    var dots = pts.map(function (p2, i) {
      var on = !!sel[ms[i]];
      return '<circle class="kv-tdot' + (on ? ' on' : '') +
             (anySel && !on ? ' off' : '') + '" data-ym="' + ms[i] +
             '" cx="' + p2[0].toFixed(1) + '" cy="' + p2[1].toFixed(1) +
             '" r="' + (on ? 4 : 2.6) + '"></circle>';
    }).join('');

    return '<div class="kv-panel kv-trend"><h3>Monthly cases' +
      (KV.state.region != null ? ', ' + esc(regionName(KV.state.region)) : '') +
      '<span class="kv-h3n">' +
      (anySel ? num(Object.keys(sel).filter(function (k) { return sel[k]; }).length) +
                ' month(s) selected'
              : 'click or drag to filter') +
      '</span></h3>' +
      '<div class="kv-twrap">' +
      '<svg class="kv-tsvg" viewBox="0 0 ' + W + ' ' + H +
        '" preserveAspectRatio="xMidYMid meet">' +
        grid + bands +
        '<path d="' + area + '" fill="rgba(150,100,26,.10)"/>' +
        '<path d="' + line + '" fill="none" stroke="' + PALETTE.accent +
        '" stroke-width="1.8" stroke-linejoin="round"/>' +
        '<g fill="' + PALETTE.accent + '">' + dots + '</g>' + ticks +
        '<rect class="kv-tsel" x="0" y="' + T + '" width="0" height="' +
          (H - T - B) + '" style="display:none"/>' +
        '<line class="kv-tcross" y1="' + T + '" y2="' + (H - B) +
          '" style="display:none"/>' +
      '</svg>' +
      '<div class="kv-tt" style="display:none"></div>' +
      '</div></div>';
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

  /* ------------------------------------------------------------- narrative */

  /* Everything the explanation pane says is computed from the same numbers the
     panels are drawn from, so the prose cannot drift from the chart above it.
     No network, no key, no latency: it is correct in the Service on first
     paint and it is correct offline. The optional model layer below enriches
     this, it does not replace it. */

  var EMPTY_STATE = {
    region: null, sev: null,
    site: {}, bu: {}, shift: {}, wclass: {}, year: {}, mech: {}, role: {}
  };

  /* The unfiltered picture, so a selection can be described as more or less
     severe than normal rather than just stated. Cached against the payload
     object: a new measure evaluation brings a new object and invalidates it. */
  function baseline(p) {
    if (KV.baseFor !== p) {
      KV.baseFor = p;
      KV.base = aggregate(p, EMPTY_STATE);
    }
    return KV.base;
  }

  function pct(a, b) {
    return b ? (a / b) * 100 : 0;
  }

  function topOf(map, lookup) {
    var best = null;
    for (var k in map) {
      if (!best || map[k] > best.n) {
        var v = lookup[k];
        best = { k: k, name: (v && v.name) || v || ('#' + k), n: map[k] };
      }
    }
    return best;
  }

  /* What the user has actually chosen, in words. */
  function selectionLabel(st) {
    var bits = [];
    if (st.region != null) bits.push(regionName(st.region));
    if (st.sev != null) bits.push((window.KV_SEV[st.sev] || {}).name || '');
    [['mech', window.KV_MECH], ['role', window.KV_ROLE], ['site', window.KV_SITE],
     ['shift', window.KV_SHIFT], ['wclass', window.KV_WCLASS]].forEach(function (pair) {
      Object.keys(st[pair[0]] || {}).forEach(function (k) {
        if (st[pair[0]][k]) bits.push(pair[1][k] || k);
      });
    });
    Object.keys(st.bu || {}).forEach(function (k) { if (st.bu[k]) bits.push(k); });
    Object.keys(st.year || {}).forEach(function (k) { if (st.year[k]) bits.push(k); });
    return bits;
  }

  function narrate(agg, base, st) {
    var out = [];
    var sel = selectionLabel(st);
    var scoped = sel.length > 0;

    if (!agg.cases) {
      return { title: 'Nothing selected matches', caveat: '',
               lines: ['No cases fall inside the current filters. Clear one to see data again.'] };
    }

    /* 1. Scope and size. */
    if (scoped) {
      out.push('<b>' + esc(sel.join(' and ')) + '</b> covers <b>' + num(agg.cases) +
               '</b> cases, ' + dec(pct(agg.cases, base.cases), 1) + '% of the ' +
               num(base.cases) + ' recorded in the period.');
    } else {
      out.push('<b>' + num(agg.cases) + '</b> cases across ' +
               num(Object.keys(agg.bySite).length) + ' sites and ' +
               num(agg.months.length) + ' months, against ' +
               num(agg.hours) + ' hours worked.');
    }

    /* 2. Severity, compared with normal. A raw recordable count says nothing
          on its own; the comparison is what makes it a finding. */
    var mine = pct(agg.recordable, agg.cases);
    var norm = pct(base.recordable, base.cases);
    var gap = mine - norm;
    var verdict = Math.abs(gap) < 2 ? 'about the usual rate'
      : (gap > 0 ? 'higher than the ' + dec(norm, 0) + '% seen overall'
                 : 'lower than the ' + dec(norm, 0) + '% seen overall');
    out.push('<b>' + num(agg.recordable) + '</b> were recordable, ' +
             dec(mine, 0) + '% of the selection, ' + verdict + '.');

    /* 3. What is driving it. */
    var m = topOf(agg.byMech, window.KV_MECH);
    var r = topOf(agg.byRole, window.KV_ROLE);
    if (m) {
      var driver = 'Most often the cause is <b>' + esc(m.name.toLowerCase()) +
                   '</b> (' + num(m.n) + ' cases)';
      if (r) driver += ', and <b>' + esc(r.name.toLowerCase()) +
                       's</b> are the most affected role (' + num(r.n) + ').';
      else driver += '.';
      out.push(driver);
    }

    /* 4. What it cost. */
    if (agg.lost) {
      out.push('<b>' + num(agg.lost) + '</b> cases put someone off work, costing <b>' +
               num(agg.daysAway) + '</b> days, an average of ' +
               dec(agg.daysAway / agg.lost, 1) + ' days per lost-time case.');
    } else {
      out.push('No case here cost a day away from work' +
               (agg.daysRestricted ? ', though ' + num(agg.daysRestricted) +
                ' days of restricted duty were recorded.' : '.'));
    }

    /* 5. Direction of travel. Half against half, which is blunt but honest;
          six points a side is too few for anything cleverer to mean much. */
    var ms = agg.months;
    if (ms.length >= 6) {
      var half = Math.floor(ms.length / 2);
      var older = 0, newer = 0;
      ms.forEach(function (mm, i) {
        var v = agg.byMonth[mm] || 0;
        if (i < half) older += v; else newer += v;
      });
      var move = pct(newer - older, older || 1);
      var word = Math.abs(move) < 10 ? 'broadly flat'
        : (move > 0 ? 'rising' : 'falling');
      out.push('The trend is <b>' + word + '</b>: ' + num(newer) +
               ' cases in the recent half against ' + num(older) + ' in the earlier.');
    }

    /* 6. The caveat, if one applies. Kept apart from the detail lines because
          it survives even when they are dropped to make room for the model. */
    var caveat = agg.partialDenominator
      ? '<i>Rates divide by total exposure: hours carry no region, severity, ' +
        'mechanism or role grain, so this filter narrows the cases but cannot ' +
        'narrow the hours.</i>'
      : '';

    return { title: scoped ? sel.join(' and ') : 'The period in full',
             lines: out, caveat: caveat };
  }

  /* A prompt asking for 55 words is a request, not a guarantee, and the pane
     cannot grow. Trim to the last full sentence that fits so a verbose reply
     loses a clause rather than silently losing its tail off the bottom. */
  function clampProse(t, max) {
    if (t.length <= max) return t;
    var cut = t.slice(0, max);
    var stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
    return (stop > max * 0.5 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, '') + '…');
  }

  /* A baked explanation was written about one region's numbers and nothing
     else, so it may only be shown when that region is the sole selection.
     Under any other combination the figures it cites would not be the figures
     on screen, and the calculated narrative takes over. */
  function bakedText() {
    var st = KV.state;
    if (st.region == null || st.sev != null) return '';
    for (var i = 0; i < SETS.length; i++) if (anyOn(st[SETS[i]])) return '';
    return (window.KV_AI || {})[st.region] || '';
  }

  function explainPanel(p, agg) {
    var n = narrate(agg, baseline(p), KV.state);
    var ai = window.__kvAI && window.__kvAI.key;
    var baked = bakedText();
    var cached = (KV.aiText && KV.aiKey === stateKey()) || !!baked;
    var lines = cached ? n.lines.slice(0, 1) : n.lines;
    var model = (window.__kvAI && window.__kvAI.model) || 'google/gemini-3.5-flash-lite';

    /* The two blocks are produced completely differently and one of them can be
       wrong, so they are labelled and boxed differently. An earlier version
       separated them with a dashed rule and a slightly different grey, which
       read as one continuous paragraph: a reader had no way to tell which
       sentences were computed and which were written by a model. */
    var computed =
      '<div class="kv-block kv-calc">' +
        '<span class="kv-tag">Calculated from the data</span>' +
        '<p class="kv-exh">' + esc(n.title) + '</p>' +
        lines.map(function (l) { return '<p>' + l + '</p>'; }).join('') +
      '</div>';

    var shown = KV.aiText && KV.aiKey === stateKey() ? KV.aiText : baked;
    var generated = shown
      ? '<div class="kv-block kv-gen">' +
          '<span class="kv-tag kv-tagai">Written by ' + esc(model.split('/').pop()) +
          '</span><p>' + esc(clampProse(shown, 300)) + '</p>' +
        '</div>'
      : '';

    return '<div class="kv-panel kv-explain"><h3>What this shows' +
      (ai ? '<button class="kv-ai" data-ai="1"' + (KV.aiBusy ? ' disabled' : '') + '>' +
        (KV.aiBusy ? 'Thinking…' : (KV.aiText ? 'Hide the model text' : 'Ask the model')) +
        '</button>' : '<span class="kv-h3n">calculated, no model involved</span>') +
      '</h3><div class="kv-ex">' + computed + generated +
      (KV.aiErr ? '<p class="kv-aierr">' + esc(KV.aiErr) + '</p>' : '') +
      (n.caveat ? '<p class="kv-cav">' + n.caveat + '</p>' : '') +
      '</div></div>';
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

  /* -------------------------------------------------- detail rows + export */

  /* Native "Export data" is no use here. Power BI exports what the visual was
     given, and this visual is given one measure: a 149,000 character HTML
     string. A reader who tries it gets markup. So the export has to be built,
     and it has to be built defensively: the iframe is sandboxed with a null
     origin, and whether downloads are permitted is set by the host, not by us.
     Three paths, ending in one that needs no browser API at all. */

  var COLS = [
    ['month', 'Month',      function (r) { return window.KV_MONTHS[r.ym] || r.ym; }],
    ['site',  'Site',       function (r) { return window.KV_SITE[r.site] || r.site; }],
    ['region', 'Body region', function (r) { return regionName(r.region); }],
    ['sev',   'Severity',   function (r) { return (window.KV_SEV[r.sev] || {}).name || r.sev; }],
    ['mech',  'Mechanism',  function (r) { return window.KV_MECH[r.mech] || r.mech; }],
    ['role',  'Job role',   function (r) { return window.KV_ROLE[r.role] || r.role; }],
    ['shift', 'Shift',      function (r) { return window.KV_SHIFT[r.shift] || r.shift; }],
    ['da',    'Days away',  function (r) { return r.da; }],
    ['dr',    'Days restricted', function (r) { return r.dr; }]
  ];

  /* Every row the current filters admit, at the grain the measure ships. */
  function detailRows(p, st) {
    var f = p.f || [], out = [], buOf = window.KV_SITE_BU || {};
    for (var j = 0; j < f.length; j += F) {
      var rk = f[j], sk = f[j + 1], ymk = f[j + 2], site = f[j + 3];
      if (!passes(st.year, Math.floor(ymk / 100))) continue;
      /* Month too. Adding a dimension to aggregate() and forgetting it here
         means the table and the export quietly disagree with the KPI cards. */
      if (!passes(st.month, ymk)) continue;
      if (!passes(st.site, site) || !passes(st.bu, buOf[site])) continue;
      if (!passes(st.shift, f[j + 4]) || !passes(st.wclass, f[j + 5])) continue;
      if (st.region != null && st.region !== rk) continue;
      if (st.sev != null && st.sev !== sk) continue;
      if (!passes(st.mech, f[j + 6]) || !passes(st.role, f[j + 7])) continue;
      out.push({ region: rk, sev: sk, ym: ymk, site: site, shift: f[j + 4],
                 wclass: f[j + 5], mech: f[j + 6], role: f[j + 7],
                 da: f[j + 8], dr: f[j + 9] });
    }
    var srt = KV.sort;
    if (srt && srt.col) {
      var col = COLS.filter(function (c) { return c[0] === srt.col; })[0];
      if (col) {
        out.sort(function (a, b) {
          var x = col[2](a), y = col[2](b);
          var c = (typeof x === 'number' && typeof y === 'number')
            ? x - y : String(x).localeCompare(String(y));
          return srt.dir === 'desc' ? -c : c;
        });
      }
    }
    return out;
  }

  /* RFC 4180 quoting. A mechanism name carrying a comma would otherwise split
     into two columns and silently shift every field after it. */
  var CSV_EOL = String.fromCharCode(13, 10);
  /* Built from char codes rather than written as a class with escapes: this
     file is generated through several layers of shell and Python quoting, and
     a literal \\r\\n in the source has been silently turned into real newlines
     more than once, which breaks the regex and flattens the CSV. */
  var CSV_NEEDS_QUOTE = new RegExp('[",' + String.fromCharCode(13, 10) + ']');

  function csvCell(v) {
    var t = v == null ? '' : String(v);
    return CSV_NEEDS_QUOTE.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }

  function toCsv(rows) {
    var lines = [COLS.map(function (c) { return csvCell(c[1]); }).join(',')];
    rows.forEach(function (r) {
      lines.push(COLS.map(function (c) { return csvCell(c[2](r)); }).join(','));
    });
    return lines.join(CSV_EOL);
  }

  var TABLE_CAP = 300;

  function table(p, agg) {
    var rows = detailRows(p, KV.state);
    var shown = rows.slice(0, TABLE_CAP);
    var srt = KV.sort || {};
    var head = COLS.map(function (c) {
      var on = srt.col === c[0];
      /* The arrow is written here rather than as CSS content: a \25b2 escape
         has to survive several quoting layers to reach the measure, and one of
         them read it as octal and produced a control character the XMLA
         request then rejected. */
      var arrow = on ? String.fromCharCode(srt.dir === 'asc' ? 9650 : 9660) : '';
      return '<th data-sort="' + c[0] + '" class="' + (on ? 'on ' + srt.dir : '') + '">' +
             esc(c[1]) + '<i>' + arrow + '</i></th>';
    }).join('');
    var body = shown.map(function (r) {
      return '<tr>' + COLS.map(function (c) {
        var v = c[2](r);
        return '<td' + (typeof v === 'number' ? ' class="n"' : '') + '>' +
               esc(typeof v === 'number' ? num(v) : v) + '</td>';
      }).join('') + '</tr>';
    }).join('');

    return '<div class="kv-panel kv-table"><h3>Cases' +
      '<span class="kv-h3n">' +
        (rows.length > TABLE_CAP
          ? 'showing ' + num(TABLE_CAP) + ' of ' + num(rows.length) + ', export gives all'
          : num(rows.length) + ' rows') +
      '</span>' +
      '<span class="kv-exp">' +
        '<button data-export="download">Download CSV</button>' +
        '<button data-export="copy">Copy</button>' +
      '</span></h3>' +
      (KV.exportMsg ? '<p class="kv-expmsg">' + esc(KV.exportMsg) + '</p>' : '') +
      (KV.exportText
        ? '<textarea class="kv-expbox" readonly>' + esc(KV.exportText) + '</textarea>'
        : '<div class="kv-tw"><table><thead><tr>' + head + '</tr></thead>' +
          '<tbody>' + (body || '<tr><td colspan="9" class="kv-empty">' +
          'No cases match the current filters.</td></tr>') + '</tbody></table></div>') +
      '</div>';
  }

  /* ---------------------------------------------------------------- guide */

  /* A demonstration rather than a screen recording. A GIF of the real report
     runs a few hundred KB, roughly 400,000 characters once base64 encoded,
     which is a fifth of the measure ceiling spent on something that blurs when
     the visual scales and cannot be corrected without re-recording. This is
     about 3KB of SVG and CSS, stays sharp at any size, and is editable as text. */
  function guide() {
    return '<div class="kv-panel kv-guide"><h3>How to explore' +
      '<span class="kv-h3n">this loops</span></h3>' +
      '<svg class="kv-demo" viewBox="0 0 320 96" aria-hidden="true">' +
        '<g class="kv-dfig" fill="#f0e2c4" stroke="#cbbb9e" stroke-width="1.2">' +
          '<circle cx="42" cy="20" r="9"/>' +
          '<rect x="31" y="31" width="22" height="26" rx="4"/>' +
          '<rect x="19" y="33" width="9" height="24" rx="4"/>' +
          '<rect x="56" y="33" width="9" height="24" rx="4"/>' +
          '<rect x="33" y="59" width="8" height="26" rx="4"/>' +
          '<rect x="43" y="59" width="8" height="26" rx="4"/>' +
        '</g>' +
        '<rect class="kv-dhit" x="31" y="31" width="22" height="26" rx="4"/>' +
        '<g class="kv-dcards">' +
          '<rect x="96" y="14" width="98" height="15" rx="3"/>' +
          '<rect x="96" y="35" width="78" height="15" rx="3"/>' +
          '<rect x="96" y="56" width="88" height="15" rx="3"/>' +
          '<rect x="206" y="14" width="98" height="57" rx="3"/>' +
        '</g>' +
        /* cursor drawn as a path, not an emoji, so it renders identically
           whatever fonts the host has */
        '<g class="kv-dcur">' +
          '<path d="M0 0 L0 13 L3.4 9.8 L5.6 14.6 L8 13.4 L5.8 8.8 L10.4 8.6 Z" ' +
            'fill="#2e2a24" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>' +
          '<circle class="kv-dring" cx="1" cy="1" r="3" fill="none" ' +
            'stroke="#96641a" stroke-width="2"/>' +
        '</g>' +
      '</svg>' +
      '<ol class="kv-steps">' +
        '<li><b>Click</b> a body region to filter the page to it.</li>' +
        '<li><b>Right-click</b> a region, or press <b>Breakdown</b>, for mechanisms, roles and sites.</li>' +
        '<li><b>Filters</b> live on the left rail. The spine shows what is applied.</li>' +
        '<li><b>Esc</b> steps back one level. Click a selected region again to clear it.</li>' +
      '</ol></div>';
  }

  /* --------------------------------------------------------- filter rail */

  /* A collapsed rail rather than a bar across the top: it buys back 86px of
     height for the figure, which is the whole point of this layout. Collapsed
     it still has to answer "what is filtered", so the active count and the
     chosen values show on the spine. */
  function railGroup(key, label, entries, sel) {
    var chips = entries.map(function (e) {
      var on = !!sel[e[0]];
      return '<button class="kv-f' + (on ? ' on' : '') + '" data-fk="' + key +
             '" data-fv="' + esc(e[0]) + '" aria-pressed="' + on + '">' +
             esc(e[1]) + '</button>';
    }).join('');
    return '<div class="kv-rg"><span class="kv-fl">' + esc(label) + '</span>' +
           '<div class="kv-rc">' + chips + '</div></div>';
  }

  function rail(p) {
    var st = KV.state;
    var years = {};
    for (var i = 0; i < (p.h || []).length; i += HH) years[Math.floor(p.h[i] / 100)] = true;

    var groups = [
      ['site', 'Site', Object.keys(window.KV_SITE).map(Number).sort(function (a, b) {
        return (window.KV_SITE[a] || '').localeCompare(window.KV_SITE[b] || '');
      }).map(function (k) { return [k, window.KV_SITE[k]]; })],
      ['bu', 'Business unit', (window.KV_BU || []).map(function (b) { return [b, b]; })],
      ['shift', 'Shift', Object.keys(window.KV_SHIFT).map(function (k) {
        return [k, window.KV_SHIFT[k]]; })],
      ['wclass', 'Worker class', Object.keys(window.KV_WCLASS).map(function (k) {
        return [k, window.KV_WCLASS[k]]; })],
      ['year', 'Year', Object.keys(years).sort().map(function (y) { return [y, y]; })]
    ];

    var active = 0, summary = [];
    var LOOK = { site: window.KV_SITE, shift: window.KV_SHIFT, wclass: window.KV_WCLASS };
    groups.forEach(function (g) {
      var chosen = Object.keys(st[g[0]]).filter(function (k) { return st[g[0]][k]; });
      active += chosen.length;
      chosen.forEach(function (k) {
        summary.push((LOOK[g[0]] && LOOK[g[0]][k]) || k);
      });
    });

    var spine =
      '<button class="kv-railbtn" data-rail="toggle" aria-expanded="' + KV.railOpen +
        '" title="Filters">' +
        '<span class="kv-railicon" aria-hidden="true"><i></i><i></i><i></i></span>' +
        (active ? '<span class="kv-railbadge">' + active + '</span>' : '') +
      '</button>' +
      '<div class="kv-railspine">' +
        (summary.length
          ? summary.slice(0, 6).map(function (t) {
              return '<span class="kv-railtag">' + esc(t) + '</span>';
            }).join('') + (summary.length > 6
              ? '<span class="kv-railtag">+' + (summary.length - 6) + '</span>' : '')
          : '<span class="kv-railtag kv-railnone">No filters</span>') +
      '</div>';

    var panel = KV.railOpen
      ? '<div class="kv-railpanel"><div class="kv-railhead"><h3>Filters</h3>' +
          '<button class="kv-railclose" data-rail="close" aria-label="Close filters">' +
          '×</button></div>' +
          groups.map(function (g) { return railGroup(g[0], g[1], g[2], st[g[0]]); }).join('') +
          '<button class="kv-reset' + (active ? '' : ' off') + '" data-clear="1">' +
          (active ? 'Clear all filters' : 'No filters applied') + '</button>' +
        '</div>'
      : '';

    return '<div class="kv-rail' + (KV.railOpen ? ' open' : '') + '">' + spine + panel + '</div>';
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

    var any = SETS.some(function (k) { return anyOn(st[k]); }) ||
              st.region != null || st.sev != null;

    return '<div class="kv-bar">' +
      '<div class="kv-brow">' + row1 +
        '<button class="kv-reset' + (any ? '' : ' off') + '" data-clear="1">' +
        (any ? 'Clear all filters' : 'No filters applied') + '</button></div>' +
      '<div class="kv-brow">' + row2 + '</div></div>';
  }

  /* ------------------------------------------------------------------ KPI */

  function kpis(agg, meta) {
    var reportable = agg.hours > 0;
    /* Exposure is recorded by site, shift, worker class and month. It has no
       region, severity, mechanism or role grain, so under those filters the
       numerator narrows and the denominator cannot. The rate is still the
       honest share-of-total-exposure figure, but the card has to say so. */
    var per = agg.partialDenominator ? 'per 200,000 hours, all exposure'
                                     : 'per 200,000 hours';
    var cards = [
      ['Cases', num(agg.cases), 'all severities'],
      ['Recordable', num(agg.recordable), dec(agg.cases ? (agg.recordable / agg.cases) * 100 : 0, 0) + '% of cases'],
      ['TRIR', reportable ? dec(agg.trir) : '—', per],
      ['DART rate', reportable ? dec(agg.dartRate) : '—', per],
      ['Days away', num(agg.daysAway), num(agg.lost) + ' lost-time cases'],
      ['Severity rate', reportable ? dec(agg.severityRate, 1) : '—',
       agg.partialDenominator ? 'days per 200,000 hours, all exposure'
                              : 'days per 200,000 hours']
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
    var bits = [];
    if (KV.state.region != null) bits.push(regionName(KV.state.region));
    if (KV.state.sev != null) bits.push((window.KV_SEV[KV.state.sev] || {}).name || '');
    [['mech', window.KV_MECH], ['role', window.KV_ROLE], ['site', window.KV_SITE]]
      .forEach(function (pair) {
        Object.keys(KV.state[pair[0]] || {}).forEach(function (k) {
          if (KV.state[pair[0]][k]) bits.push(pair[1][k] || k);
        });
      });
    if (bits.length) {
      chip = '<button class="kv-chip" data-clear="1">' +
             esc(bits.slice(0, 3).join(' · ')) +
             (bits.length > 3 ? ' +' + (bits.length - 3) : '') +
             ' <span aria-hidden="true">×</span></button>';
    }

    var sevRows = Object.keys(window.KV_SEV).map(function (k) {
      return { k: +k, name: window.KV_SEV[k].name, n: agg.bySev[k] || 0 };
    }).filter(function (r) { return r.n > 0; })
      .sort(function (a, b) { return b.n - a.n; });

    var sevTotal = sumOf(agg.bySev);
    var sevHtml = '<div class="kv-panel"><h3>Severity mix' +
      '<span class="kv-h3n">click to filter</span></h3>' +
      '<ul class="kv-bars kv-sev">' +
      (sevRows.length ? sevRows.map(function (r) {
        var pct = sevTotal ? (r.n / sevTotal) * 100 : 0;
        var on = KV.state.sev === r.k;
        return '<li data-sev="' + r.k + '" role="button" tabindex="0" aria-pressed="' +
               on + '" class="' + (on ? 'on' : '') + '">' +
               '<span class="kv-bl">' + esc(r.name) + '</span>' +
               '<span class="kv-bt"><i style="width:' + pct.toFixed(1) +
               '%;background:' + PALETTE.accent2 + '"></i></span>' +
               '<span class="kv-bv">' + num(r.n) + '<em>' + dec(pct, 0) + '%</em></span></li>';
      }).join('') : '<li class="kv-empty">No cases.</li>') + '</ul></div>';

    /* Right-click drills into one region, but the breakdowns are also worth
       seeing across everything, so the view does not require a selection. */
    var detail = KV.view === 'detail';
    var scope = KV.state.region != null ? regionName(KV.state.region) : 'All body regions';

    var head =
      '<div class="kv-head">' +
        '<div class="kv-head-l">' +
          (detail
            ? '<button class="kv-back" data-goto="map">' +
              '<span aria-hidden="true">&#8592;</span> Back to the map</button>'
            : '') +
          '<div><h1>' + esc(detail ? scope : (meta.title || 'Injury site surveillance')) + '</h1>' +
          '<p>' + esc(detail
            ? 'Breakdown. ' + (meta.caption || '')
            : (meta.caption || '')) + '</p></div>' +
        '</div>' +
        '<div class="kv-head-r">' + chip +
        '<span class="kv-through">Data through ' + esc(meta.through || '') + '</span></div>' +
      '</div>';

    var body = detail
      ? '<div class="kv-detail">' +
          sevHtml +
          bars('Cases by site', topRows(agg.bySite, window.KV_SITE, 9),
               sumOf(agg.bySite), PALETTE.warn, 'site') +
          bars('Top mechanisms', topRows(agg.byMech, window.KV_MECH, 9),
               sumOf(agg.byMech), PALETTE.accent, 'mech') +
          bars('Most exposed roles', topRows(agg.byRole, window.KV_ROLE, 9),
               sumOf(agg.byRole), PALETTE.good, 'role') +
          table(p, agg) +
          trend(agg) +
        '</div>'
      : '<div class="kv-body">' +
          '<div class="kv-map"><div class="kv-maphead"><h3>Injury site</h3>' +
            '<span class="kv-hint">' +
            (KV.state.region != null
              ? esc(regionName(KV.state.region)) + ' selected'
              : 'Click a region to filter') +
            '</span>' +
            '<button class="kv-drill" data-goto="detail">Breakdown ' +
            '<span aria-hidden="true">&#8594;</span></button>' +
            '</div>' + figure(agg) +
            '<div class="kv-legend"><span>0</span>' +
            [0, .2, .4, .6, .8, 1].map(function (t) {
              return '<i style="background:' + ramp(t) + '"></i>';
            }).join('') + '<span>' + num(agg.maxRegion) + ' cases</span></div>' +
            unmapped(agg) +
          '</div>' +
          '<div class="kv-side">' + explainPanel(p, agg) + guide() + '</div>' +
        '</div>';

    root.innerHTML = rail(p) + '<div class="kv-main">' + head + kpis(agg, meta) + body + '</div>';
  }

  function schedule(root, p) {
    if (KV.frame) return;
    KV.frame = requestAnimationFrame(function () {
      KV.frame = 0;
      paint(root, p);
      fit();
    });
  }

  /* ------------------------------------------------- optional model layer */

  /* OFF unless the host sets window.__kvAI = { key, model, endpoint }.
     It is deliberately not settable from the measure: anything written into
     DAX is readable by anyone who can open the report or view the model, so a
     key embedded there is a key you have published. In the Service, set it
     from a companion script or put a proxy you control in front of the API
     and leave the key on the server.

     What gets sent is the aggregate, not a screenshot. The renderer already
     holds these numbers exactly; rendering them to pixels and asking a vision
     model to read them back is slower, dearer, and can misread a digit with no
     way to detect it. Facts in, prose out. */

  function stateKey() {
    var st = KV.state;
    return [st.region, st.sev].concat(SETS.map(function (k) {
      return k + ':' + Object.keys(st[k]).filter(function (x) { return st[k][x]; }).sort().join('|');
    })).join(';');
  }

  /* A compact, self-describing brief. Small enough to be cheap, complete
     enough that the model never has to guess a number. */
  function aiFacts(p, agg) {
    var base = baseline(p);
    var top = function (map, lookup, n) {
      return topRows(map, lookup, n).map(function (r) { return { name: r[1], cases: r[2] }; });
    };
    return {
      selection: selectionLabel(KV.state),
      period: { months: agg.months.length, from: agg.months[0], to: agg.months[agg.months.length - 1] },
      totals: {
        cases: agg.cases, recordable: agg.recordable, dart: agg.dart,
        lostTime: agg.lost, daysAway: agg.daysAway, daysRestricted: agg.daysRestricted,
        hoursWorked: Math.round(agg.hours)
      },
      rates: {
        trir: agg.trir == null ? null : +agg.trir.toFixed(2),
        dartRate: agg.dartRate == null ? null : +agg.dartRate.toFixed(2),
        severityRate: agg.severityRate == null ? null : +agg.severityRate.toFixed(1),
        note: agg.partialDenominator
          ? 'exposure hours are not filtered by region, severity, mechanism or role'
          : 'numerator and denominator are filtered alike'
      },
      unfiltered: { cases: base.cases, recordable: base.recordable,
                    trir: base.trir == null ? null : +base.trir.toFixed(2) },
      /* Precomputed so the model never has to do arithmetic. Every percentage
         it might reach for is already here, which lets the grounding check
         below be strict instead of having to allow for derived values. */
      derived: {
        shareOfAllCasesPct: +pct(agg.cases, base.cases).toFixed(1),
        recordableSharePct: +pct(agg.recordable, agg.cases).toFixed(1),
        recordableShareUnfilteredPct: +pct(base.recordable, base.cases).toFixed(1),
        daysPerLostTimeCase: agg.lost ? +(agg.daysAway / agg.lost).toFixed(1) : null,
        hoursWorkedMillions: +(agg.hours / 1e6).toFixed(2)
      },
      topBodyRegions: top(agg.byRegion, window.KV_REGIONS, 5),
      topMechanisms: top(agg.byMech, window.KV_MECH, 5),
      topRoles: top(agg.byRole, window.KV_ROLE, 5),
      bySite: top(agg.bySite, window.KV_SITE, 8),
      monthlyCases: agg.months.map(function (m) {
        return [window.KV_MONTHS[m] || m, agg.byMonth[m] || 0];
      }),
      notLocalised: agg.unmappedTotal
    };
  }

  /* Post-validation. Measured over 24 live calls, one reply printed exposure
     hours as 209,000,000 against a real 20,900,000: a single extra zero, in a
     safety report, phrased with total confidence. Prompting alone cannot rule
     that out, so every figure in the reply is checked against the brief that
     produced it and the whole reply is withheld if any of them is not there.
     A missing explanation is recoverable; a wrong number that looks official
     is not. The deterministic summary above is unaffected either way. */
  function ungroundedNumbers(text, facts) {
    var hay = JSON.stringify(facts);
    var seen = {};
    /* Every literal in the brief, plus the same values with thousands
       separators, since that is how the model will naturally write them. */
    (hay.match(/\d+(?:\.\d+)?/g) || []).forEach(function (v) {
      seen[v] = 1;
      seen[Number(v).toLocaleString('en-US')] = 1;
      seen[String(Math.round(Number(v)))] = 1;
    });
    var bad = [];
    (text.match(/\b\d[\d,]*(?:\.\d+)?\b/g) || []).forEach(function (raw) {
      var plain = raw.replace(/,/g, '');
      if (seen[plain] || seen[raw] || seen[String(Number(plain))]) return;
      /* Ordinals and small counts inside prose ("the top 3") are not claims
         about the data; anything four digits or more is. */
      if (Number(plain) < 100 && plain.indexOf('.') === -1) return;
      if (bad.indexOf(raw) === -1) bad.push(raw);
    });
    return bad;
  }

  var AI_SYSTEM =
    'You are a safety analyst briefing an HSE manager on an occupational injury ' +
    'report. You will be given the aggregate the dashboard is currently showing. ' +
    'Write three or four short sentences of plain English: what stands out, what ' +
    'it probably means operationally, and what to look at next. ' +
    'Rules. Every figure you cite must appear verbatim in the data you are ' +
    'given: do not calculate, do not round, do not convert units, do not infer ' +
    'a number from another number. Percentages and averages you might want are ' +
    'already supplied under "derived". Prefer naming things over quoting ' +
    'figures; two or three numbers is plenty. If rates.note says exposure is ' +
    'not filtered alike, do not compare that rate to the unfiltered one. No ' +
    'bullet points, no headings, no preamble, no markdown. Keep it to two or ' +
    'three sentences and under 55 words.';

  function askModel(p, agg, root) {
    var cfg = window.__kvAI || {};
    if (!cfg.key || KV.aiBusy) return;
    var key = stateKey();
    KV.aiBusy = true;
    KV.aiErr = '';
    schedule(root, p);

    var facts = aiFacts(p, agg);
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, cfg.timeoutMs || 25000);

    fetch(cfg.endpoint || 'https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: ctrl ? ctrl.signal : undefined,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key },
      body: JSON.stringify({
        model: cfg.model || 'google/gemini-3.5-flash-lite',
        max_tokens: cfg.maxTokens || 300,
        temperature: 0.2,
        messages: [
          { role: 'system', content: AI_SYSTEM },
          { role: 'user', content: JSON.stringify(facts) }
        ]
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      var txt = j && j.choices && j.choices[0] && j.choices[0].message &&
                j.choices[0].message.content;
      if (!txt) throw new Error('no text in the response');
      txt = String(txt).trim();
      var bad = ungroundedNumbers(txt, facts);
      if (bad.length) {
        KV.aiText = '';
        KV.aiKey = '';
        KV.aiErr = 'Discarded: the model cited ' + bad.join(', ') +
                   ', which is not in the data it was given. Try again.';
        return;
      }
      KV.aiText = txt;
      KV.aiKey = key;
    })['catch'](function (e) {
      /* Never blank the deterministic narrative because a network call failed.
         The pane above it is still correct and still the point. */
      KV.aiErr = 'The model could not be reached (' +
                 (e && e.name === 'AbortError' ? 'timed out' : String(e.message || e)) +
                 '). The summary above is unaffected.';
    }).then(function () {
      clearTimeout(timer);
      KV.aiBusy = false;
      schedule(root, window.__kvBody);
    });
  }

  /* --------------------------------------------------------------- export */

  /* Three paths, in order of how pleasant they are, ending in one that cannot
     fail. Whether a sandboxed iframe may start a download is decided by the
     host's sandbox flags, which we neither see nor control, and a blocked
     download fails silently. So the fallback is not an error message, it is the
     data itself, selected and ready to copy. */
  function exportCsv(mode, root) {
    var rows = detailRows(window.__kvBody, KV.state);
    var csv = toCsv(rows);
    var name = 'kelvara-cases-' +
      (KV.state.region != null
        ? regionName(KV.state.region).toLowerCase().replace(/[^a-z0-9]+/g, '-')
        : 'all') + '.csv';

    if (mode === 'download') {
      try {
        var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          URL.revokeObjectURL(url);
          if (a.parentNode) a.parentNode.removeChild(a);
        }, 1500);
        KV.exportMsg = 'Downloading ' + name + ' with ' + num(rows.length) +
                       ' rows. If nothing arrives, the host blocked it: use Copy.';
        KV.exportText = '';
      } catch (err) {
        KV.exportText = csv;
        KV.exportMsg = 'This host blocks downloads. The rows are below, select ' +
                       'all and copy.';
      }
      return schedule(root, window.__kvBody);
    }

    /* Copy. The async Clipboard API needs a permission and a secure context and
       a null origin usually has neither, so execCommand is tried too, and the
       textarea stays on screen either way. */
    KV.exportText = csv;
    KV.exportMsg = num(rows.length) + ' rows. Copied to the clipboard if your ' +
                   'host allows it; otherwise select all below and copy.';
    schedule(root, window.__kvBody);
    setTimeout(function () {
      var box = root.querySelector('.kv-expbox');
      if (!box) return;
      box.focus();
      box.select();
      try { document.execCommand('copy'); } catch (e) { /* fine, it is selected */ }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(csv)['catch'](function () { /* fine */ });
      }
    }, 40);
  }

  /* --------------------------------------------------------------- scaling */

  /* The page is authored at exactly 1920x1080 and then scaled to whatever box
     the visual hands us. Power BI sizes the visual's iframe in real pixels,
     which on a windowed Desktop is routinely half the design size; a fluid
     layout with fixed bands (head 44, filter bar 86, KPI 92, trend row 254)
     had nothing left for the figure and crushed it to about 160px. Scaling a
     fixed stage keeps the composition identical at every size, which is what
     the rest of the report means by FitToPage. */
  function fit() {
    var root = document.getElementById('kv-root');
    var box = document.getElementById('kv-fit');
    if (!root || !box) return;
    var w = box.clientWidth || window.innerWidth;
    var h = box.clientHeight || window.innerHeight;
    if (!w || !h) return;
    var s = Math.min(w / 1920, h / 1080);
    /* Centre the leftover space rather than pinning to a corner. */
    var x = Math.max(0, (w - 1920 * s) / 2);
    var y = Math.max(0, (h - 1080 * s) / 2);
    root.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) +
                           'px) scale(' + s.toFixed(4) + ')';
  }

  function watchSize() {
    if (KV.sized) return;
    KV.sized = true;
    if (typeof ResizeObserver === 'function') {
      var box = document.getElementById('kv-fit');
      if (box) { new ResizeObserver(fit).observe(box); }
    }
    window.addEventListener('resize', fit);
  }

  /* ------------------------------------------------------- trend pointer */

  /* Hover is handled by moving three elements, not by repainting. A repaint per
     mousemove would re-aggregate 1,492 rows sixty times a second to move a
     line four pixels. Click and drag do change state, so those repaint. */
  function trendGeom(svg, clientX) {
    var g = KV.trend;
    if (!g || !g.months.length) return null;
    var box = svg.getBoundingClientRect();
    /* preserveAspectRatio="meet" letterboxes, so map through the painted box
       rather than assuming the svg fills its element. */
    var scale = Math.min(box.width / g.W, box.height / g.H);
    var padX = (box.width - g.W * scale) / 2;
    var ux = (clientX - box.left - padX) / scale;
    var i = Math.round((ux - g.L) / g.step);
    if (i < 0) i = 0;
    if (i > g.months.length - 1) i = g.months.length - 1;
    return { i: i, ym: g.months[i], x: g.L + i * g.step, g: g };
  }

  function trendHover(svg, hit) {
    var wrap = svg.parentNode;
    var cross = svg.querySelector('.kv-tcross');
    var tip = wrap.querySelector('.kv-tt');
    if (!hit) {
      if (cross) cross.style.display = 'none';
      if (tip) tip.style.display = 'none';
      return;
    }
    var g = hit.g;
    if (cross) {
      cross.setAttribute('x1', hit.x.toFixed(1));
      cross.setAttribute('x2', hit.x.toFixed(1));
      cross.style.display = '';
    }
    if (tip) {
      tip.innerHTML = '<b>' + esc(window.KV_MONTHS[hit.ym] || hit.ym) + '</b>' +
                      '<span>' + num(g.vals[hit.i]) + ' cases</span>';
      tip.style.display = '';
      /* place it in element space, clamped so it never leaves the panel */
      var box = svg.getBoundingClientRect();
      var scale = Math.min(box.width / g.W, box.height / g.H);
      var padX = (box.width - g.W * scale) / 2;
      var px = padX + hit.x * scale;
      var w = tip.offsetWidth || 96;
      tip.style.left = Math.max(2, Math.min(box.width - w - 2, px - w / 2)) + 'px';
    }
  }

  function trendBand(svg, a, b) {
    var g = KV.trend, rect = svg.querySelector('.kv-tsel');
    if (!rect || !g) return;
    if (a == null || b == null) { rect.style.display = 'none'; return; }
    var lo = Math.min(a, b), hi = Math.max(a, b);
    rect.setAttribute('x', (g.L + (lo - 0.5) * g.step).toFixed(1));
    rect.setAttribute('width', ((hi - lo + 1) * g.step).toFixed(1));
    rect.style.display = '';
  }

  function wireTrend(root) {
    if (root.__kvTrend) return;
    root.__kvTrend = true;
    var drag = null;

    root.addEventListener('mousemove', function (e) {
      var svg = e.target.closest ? e.target.closest('.kv-tsvg') : null;
      if (!svg) { drag = null; return; }
      var hit = trendGeom(svg, e.clientX);
      trendHover(svg, hit);
      if (drag && hit) { drag.to = hit.i; trendBand(svg, drag.from, drag.to); }
    });

    root.addEventListener('mouseleave', function (e) {
      var svg = root.querySelector('.kv-tsvg');
      if (svg) { trendHover(svg, null); trendBand(svg, null, null); }
      drag = null;
    }, true);

    root.addEventListener('mousedown', function (e) {
      var svg = e.target.closest ? e.target.closest('.kv-tsvg') : null;
      if (!svg || e.button !== 0) return;
      var hit = trendGeom(svg, e.clientX);
      if (hit) drag = { from: hit.i, to: hit.i };
      e.preventDefault();
    });

    root.addEventListener('mouseup', function (e) {
      var svg = e.target.closest ? e.target.closest('.kv-tsvg') : null;
      if (!svg || !drag) { drag = null; return; }
      var hit = trendGeom(svg, e.clientX);
      if (!hit) { drag = null; return; }
      var g = KV.trend;
      var lo = Math.min(drag.from, hit.i), hi = Math.max(drag.from, hit.i);
      var st = KV.state;
      if (lo === hi) {
        /* a click toggles one month */
        var ym = g.months[lo];
        if (st.month[ym]) delete st.month[ym]; else st.month[ym] = true;
      } else {
        /* a drag replaces the selection with the range, which is what a brush
           on a time axis is expected to do */
        st.month = {};
        for (var i = lo; i <= hi; i++) st.month[g.months[i]] = true;
      }
      drag = null;
      trendBand(svg, null, null);
      schedule(root, window.__kvBody);
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
        var th = e.target.closest('th[data-sort]');
        if (th) {
          var col = th.getAttribute('data-sort');
          KV.sort = (KV.sort && KV.sort.col === col && KV.sort.dir === 'asc')
            ? { col: col, dir: 'desc' } : { col: col, dir: 'asc' };
          return schedule(root, window.__kvBody);
        }
        var exp = e.target.closest('[data-export]');
        if (exp) {
          exportCsv(exp.getAttribute('data-export'), root);
          return;
        }
        if (KV.exportText && !e.target.closest('.kv-table')) {
          KV.exportText = ''; KV.exportMsg = '';
          schedule(root, window.__kvBody);
        }
        var railBtn = e.target.closest('[data-rail]');
        if (railBtn) {
          KV.railOpen = railBtn.getAttribute('data-rail') === 'toggle' ? !KV.railOpen : false;
          return schedule(root, window.__kvBody);
        }
        /* NOT data-view: every figure path already carries data-view="front"
             or "back" for the geometry tests, so this selector matched every
             region click and set the view to "back". */
        var goTo = e.target.closest('[data-goto]');
        if (goTo) {
          KV.view = goTo.getAttribute('data-goto');
          KV.exportText = ''; KV.exportMsg = '';
          return schedule(root, window.__kvBody);
        }
        /* Clicking anywhere outside an open rail closes it, the way a drawer
           should behave. Checked before the other targets so a stray click on
           the canvas dismisses rather than selects. */
        if (KV.railOpen && !e.target.closest('.kv-rail')) {
          KV.railOpen = false;
          schedule(root, window.__kvBody);
          return;
        }
        var clear = e.target.closest('[data-clear]');
        if (clear) {
          KV.state.region = null;
          KV.state.sev = null;
          SETS.forEach(function (k) { KV.state[k] = {}; });
          KV.view = 'map';
          return schedule(root, window.__kvBody);
        }
        if (e.target.closest('[data-ai]')) {
          if (KV.aiText && KV.aiKey === stateKey()) {
            KV.aiText = '';        /* back to the full deterministic detail */
            KV.aiKey = '';
            return schedule(root, window.__kvBody);
          }
          return askModel(window.__kvBody, aggregate(window.__kvBody, KV.state), root);
        }
        var fchip = e.target.closest('[data-fk]');
        if (fchip) {
          var fk = fchip.getAttribute('data-fk');
          var fv = fchip.getAttribute('data-fv');
          /* Keys arrive from the DOM as strings. The payload holds numbers, so
             site/shift/worker comparisons must be coerced or every chip would
             silently match nothing. Business unit and year stay strings. */
          var kk = NUMERIC_SETS[fk] ? Number(fv) : fv;
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
            if (KV.state.region == null) KV.view = 'map';
            schedule(root, window.__kvBody);
          }
        }
      });
      /* Right-click is the drill gesture. preventDefault stops the iframe's own
         menu; Power BI may still raise its own over a custom visual, which is
         outside our control, so the map header also says the gesture exists and
         a left-click still selects. */
      wireTrend(root);

      root.addEventListener('contextmenu', function (e) {
        var path = e.target.closest('path[data-region]');
        if (!path) return;
        e.preventDefault();
        var keys = window.KV_SVG_TO_KEY[path.getAttribute('data-region')] || [];
        if (keys[0] == null) return;
        KV.state.region = keys[0];
        KV.view = 'detail';
        KV.railOpen = false;
        schedule(root, window.__kvBody);
      });

      root.addEventListener('keydown', function (e) {
        /* Rows are role="button" and focusable, so Enter and Space must do what
           a click does; otherwise the panels are mouse-only. */
        if (e.key === 'Enter' || e.key === ' ') {
          var b = e.target.closest('[data-fk],[data-sev]');
          if (b) {
            e.preventDefault();
            b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            return;
          }
        }
        if (e.key === 'Escape' && KV.railOpen) {
          KV.railOpen = false;
          return schedule(root, window.__kvBody);
        }
        if (e.key === 'Escape' && KV.view === 'detail') {
          KV.view = 'map';
          return schedule(root, window.__kvBody);
        }
        if (e.key === 'Escape') {
          KV.state.region = null;
          KV.state.sev = null;
          SETS.forEach(function (k) { KV.state[k] = {}; });
          schedule(root, window.__kvBody);
        }
      });
    }

    /* A region that vanished from the payload after a slicer change must not
       leave the visual filtered to nothing.

       The stride is F, not 6. Walking by 6 against a real stride of 10 visits
       offsets 0, 2, 4, 6 and 8, so it compared the region key against month,
       shift, mechanism and days away as well. Days away runs 0 to 180 and so
       contains almost every region key as an ordinary value: the guard found a
       false match and left the stale region in place for 21 of the 30 regions,
       which is the exact thing it exists to prevent. */
    if (KV.state.region != null) {
      var seen = false, f = p.f || [];
      for (var i = 0; i < f.length; i += F) {
        if (f[i] === KV.state.region) { seen = true; break; }
      }
      if (!seen) KV.state.region = null;
    }

    paint(root, p);
    fit();
    watchSize();
  };

  KV.boot();
})();
