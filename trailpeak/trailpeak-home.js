/*!
 * TrailPeak Outfitters - HOME, a WebGL2 landing page as one Power BI visual
 * ---------------------------------------------------------------------------
 * Repo    : https://github.com/sulaiman013/dax-with-js
 * Serve   : https://cdn.statically.io/gh/sulaiman013/dax-with-js@trailpeak-home-v1.0.0/trailpeak/trailpeak-home.js
 * License : MIT
 *
 * WHAT THIS IS
 * ---------------------------------------------------------------------------
 * The whole landing page of the report, rendered by one DAX measure into one
 * HTML Content visual: a hand-written WebGL2 scene (no Three.js, no second CDN
 * request) plus a DOM overlay. The globe is not decoration. Every dot on it is
 * lit by real revenue, every pin is a real store at its real coordinates, and
 * every arc is weighted by the revenue of the two stores it joins.
 *
 * THE THREE THINGS THAT MAKE THIS HARD IN POWER BI
 * ---------------------------------------------------------------------------
 * 1. THE DOM IS REPLACED ON EVERY CROSS-FILTER, RESIZE AND REFRESH.
 *    So a WebGL context created during render() would be created again, and
 *    again. Browsers cap live WebGL contexts at roughly 16 and then start
 *    killing the oldest. A naive implementation looks perfect and then goes
 *    black on the sixteenth interaction.
 *    The fix: ONE canvas and ONE context, created once, parked on `window`,
 *    and re-adopted into each freshly built DOM. See ensureCanvas().
 *
 * 2. THE ANIMATION LOOP MUST BE A SINGLETON.
 *    Every re-execution of this file would otherwise start another
 *    requestAnimationFrame chain. Ten cross-filters, ten loops, one dying
 *    laptop. The loop handle lives on the same window object and is cancelled
 *    before a new one starts.
 *
 * 3. NULL ORIGIN.
 *    The visual runs in an iframe sandboxed `allow-scripts` WITHOUT
 *    `allow-same-origin`. No cookies, no localStorage, no sessionStorage: they
 *    throw, they do not merely fail. UI state lives on window.__tphState.
 *
 * THE DATA CONTRACT - window.__tpHome
 * ---------------------------------------------------------------------------
 * Aggregates only, roughly 5KB, well under 1% of the ~2.1M measure ceiling.
 * Money is integer minor units (cents) and ratios are integer basis points, so
 * FORMAT(x,"0") in DAX emits no separator and no decimal in any locale. A
 * de-DE workspace cannot corrupt the payload. Blanks emit null, never 0,
 * because a zero budget would read as a 100% adverse variance.
 *
 *   meta     {title, subtitle, company, dataThrough, currency, locale, build}
 *   kpi      {rev, cogs, gp, gmBp, opex, ebitda, ebitdaBp, op, opBp,
 *             varc, varBp, units, prodRev, nProducts, nStores, nRegions, nMonths}
 *   stores   [[key, code, name, city, state, region, tier,
 *              rev, gmBp, op, varc, units, sqft], ...]
 *   regions  [[name, rev, gmBp, op, nStores], ...]
 *   trend    [[monthKey, label, rev, gp, op, budget], ...]   chronological
 *   products [[sku, name, category, rev, units, margin], ...]
 *   cats     [[name, rev, units, skus], ...]
 *
 * Store coordinates are NOT in the payload and NOT in the semantic model.
 * Latitude and longitude are renderer reference data, the same class of thing
 * as a colour ramp, so they live here. GEO below is keyed by StoreCode.
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var NS = 'tph';

  /* -------------------------------------------------------------------------
   * 1. INSTALL GUARD
   * On re-execution the closure is already built. Do not rebuild it, just
   * re-render through the instance that is already installed.
   * ---------------------------------------------------------------------- */
  if (window.TPH && window.TPH.__installed === VERSION && typeof window.TPH.boot === 'function') {
    window.TPH.boot();
    return;
  }

  /* -------------------------------------------------------------------------
   * 2. RENDERER REFERENCE DATA
   * ---------------------------------------------------------------------- */
  var GEO = {
    DEN01: [39.7392, -104.9903], BLD01: [40.0150, -105.2705],
    SLC01: [40.7608, -111.8910], BOI01: [43.6150, -116.2023],
    SEA01: [47.6062, -122.3321], PDX01: [45.5152, -122.6784],
    SAC01: [38.5816, -121.4944], AUS01: [30.2672, -97.7431],
    PHX01: [33.4484, -112.0740], ABQ01: [35.0844, -106.6504],
    CHI01: [41.8781, -87.6298],  MSP01: [44.9778, -93.2650]
  };

  var REGION_COLOR = {
    Mountain:  [0.36, 0.85, 0.62],
    Pacific:   [0.13, 0.83, 0.93],
    Southwest: [0.98, 0.75, 0.24],
    Midwest:   [0.66, 0.55, 0.98]
  };
  var REGION_HEX = {
    Mountain: '#5cd99e', Pacific: '#22d3ee', Southwest: '#fbbf24', Midwest: '#a78bfa'
  };

  var DOT_COUNT   = 9000;
  /* World-space radius of one globe dot. 9000 Fibonacci points on a unit
     sphere sit about sqrt(4*pi/9000) = 0.037 rad apart, so 0.024 fills the
     shell without the dots merging into a solid surface. */
  var DOT_R       = 0.016;
  var STAR_COUNT  = 1400;
  var ARC_SEGS    = 96;
  var GLOBE_R     = 1.0;
  var DPR_CAP     = 2;

  /* -------------------------------------------------------------------------
   * 3. STYLES
   * The UI is authored in a fixed 1920x1080 stage and scaled with a transform,
   * so the layout is pixel-identical whatever size the visual ends up. The
   * canvas is deliberately OUTSIDE that stage and sized to real device pixels,
   * so the 3D stays crisp instead of being scaled up from 1920.
   * ---------------------------------------------------------------------- */
  var CSS = [
    '.tph{position:absolute;inset:0;overflow:hidden;background:#04060c;',
    '  font:400 14px/1.5 "Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif;',
    '  color:#e6edf7;-webkit-font-smoothing:antialiased;contain:strict}',
    '.tph *,.tph *::before,.tph *::after{box-sizing:border-box}',
    '.tph-gl{position:absolute;inset:0;width:100%;height:100%;display:block;z-index:0;cursor:grab;touch-action:none}',
    '.tph-gl.is-drag{cursor:grabbing}',
    '.tph-vig{position:absolute;inset:0;z-index:1;pointer-events:none;',
    '  background:radial-gradient(120% 78% at 50% 46%,rgba(0,0,0,0) 38%,rgba(2,4,10,.72) 82%,rgba(2,4,10,.94) 100%)}',
    '.tph-scan{position:absolute;inset:0;z-index:2;pointer-events:none;opacity:.30;',
    '  background:repeating-linear-gradient(0deg,rgba(120,200,255,.055) 0 1px,rgba(0,0,0,0) 1px 3px)}',
    '.tph-stage{position:absolute;top:0;left:0;width:1920px;height:1080px;z-index:3;',
    '  transform-origin:0 0;pointer-events:none}',
    '.tph-stage>*{pointer-events:auto}',

    /* ---- shared panel chrome ---- */
    '.tph-p{position:absolute;background:linear-gradient(160deg,rgba(10,18,34,.80),rgba(6,11,22,.66));',
    '  border:1px solid rgba(88,140,190,.20);border-radius:14px;backdrop-filter:blur(14px);',
    '  -webkit-backdrop-filter:blur(14px);box-shadow:0 20px 60px -22px rgba(0,0,0,.9),inset 0 1px 0 rgba(255,255,255,.05)}',
    '.tph-p::before{content:"";position:absolute;left:14px;right:14px;top:-1px;height:1px;',
    '  background:linear-gradient(90deg,transparent,rgba(34,211,238,.55),transparent)}',
    '.tph-h{display:flex;align-items:center;gap:8px;padding:13px 18px 0;',
    '  font:600 10.5px/1 "Segoe UI",sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#7d93b2}',
    '.tph-h i{width:5px;height:5px;border-radius:50%;background:#22d3ee;box-shadow:0 0 9px #22d3ee;font-style:normal}',

    /* ---- top bar ---- */
    '.tph-top{position:absolute;left:0;right:0;top:0;height:88px;display:flex;align-items:center;',
    '  padding:0 46px;gap:20px;z-index:4;',
    '  background:linear-gradient(180deg,rgba(4,7,14,.92),rgba(4,7,14,0))}',
    '.tph-brand{display:flex;align-items:center;gap:15px}',
    '.tph-mark{width:42px;height:42px;position:relative;flex:0 0 auto}',
    '.tph-mark svg{position:absolute;inset:0;width:100%;height:100%}',
    '.tph-bt h1{margin:0;font:600 20px/1.15 "Segoe UI",sans-serif;letter-spacing:-.015em;color:#f2f7ff}',
    '.tph-bt p{margin:2px 0 0;font:500 11px/1 "Segoe UI",sans-serif;letter-spacing:.20em;',
    '  text-transform:uppercase;color:#6d84a3}',
    '.tph-spacer{flex:1 1 auto}',
    '.tph-stat{display:flex;align-items:center;gap:9px;padding:8px 15px;border-radius:999px;',
    '  border:1px solid rgba(52,211,153,.30);background:rgba(16,44,38,.42);',
    '  font:600 11px/1 "Segoe UI",sans-serif;letter-spacing:.13em;text-transform:uppercase;color:#6ee7b7}',
    '.tph-dot{width:6px;height:6px;border-radius:50%;background:#34d399;box-shadow:0 0 10px #34d399;',
    '  animation:tph-pulse 2.4s ease-in-out infinite}',
    '@keyframes tph-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.72)}}',
    '.tph-thru{font:500 12px/1 "Segoe UI",sans-serif;color:#8ea4c2;letter-spacing:.06em}',
    '.tph-thru b{color:#e6edf7;font-weight:600}',

    /* ---- KPI rail (left) ---- */
    '.tph-kpis{left:46px;top:126px;width:392px;padding:0 0 16px}',
    '.tph-kpi{display:block;width:100%;text-align:left;border:0;background:none;color:inherit;',
    '  font:inherit;cursor:default;padding:15px 20px 14px;position:relative}',
    '.tph-kpi+.tph-kpi{border-top:1px solid rgba(88,140,190,.13)}',
    '.tph-kl{font:600 10px/1 "Segoe UI",sans-serif;letter-spacing:.17em;text-transform:uppercase;color:#7d93b2}',
    '.tph-kv{margin-top:7px;font:600 33px/1 ui-monospace,Consolas,"Cascadia Mono",monospace;',
    '  letter-spacing:-.02em;color:#f2f7ff;font-variant-numeric:tabular-nums}',
    '.tph-kv small{font-size:19px;color:#8ea4c2;margin-left:3px}',
    '.tph-kd{margin-top:6px;display:flex;align-items:center;gap:7px;font:500 11.5px/1 "Segoe UI",sans-serif}',
    '.tph-kd b{font-weight:600;font-variant-numeric:tabular-nums}',
    '.tph-up{color:#34d399}.tph-dn{color:#f87171}.tph-nu{color:#8ea4c2}',
    '.tph-spark{position:absolute;right:18px;top:20px;width:96px;height:34px;opacity:.85}',

    /* ---- region board (left, lower) ---- */
    '.tph-reg{left:46px;top:566px;width:392px;padding-bottom:14px}',
    '.tph-rrow{display:grid;grid-template-columns:14px 1fr auto;gap:11px;align-items:center;',
    '  padding:9px 20px;cursor:pointer;transition:background .16s}',
    '.tph-rrow:hover{background:rgba(34,211,238,.07)}',
    '.tph-rrow.is-on{background:rgba(34,211,238,.12)}',
    '.tph-rsw{width:9px;height:9px;border-radius:2.5px;justify-self:center}',
    '.tph-rn{font:600 13px/1.25 "Segoe UI",sans-serif;color:#dbe6f5}',
    '.tph-rb{margin-top:5px;height:3px;border-radius:2px;background:rgba(88,140,190,.20);overflow:hidden}',
    '.tph-rb span{display:block;height:100%;border-radius:2px;transition:width .7s cubic-bezier(.22,1,.36,1)}',
    '.tph-rv{text-align:right;font:600 13px/1.25 ui-monospace,Consolas,monospace;color:#f2f7ff;',
    '  font-variant-numeric:tabular-nums}',
    '.tph-rs{display:block;font:500 10.5px/1.3 "Segoe UI",sans-serif;color:#7d93b2;margin-top:2px}',

    /* ---- right column ---- */
    '.tph-store{right:46px;top:126px;width:392px;padding-bottom:16px}',
    '.tph-sempty{padding:16px 20px 4px;font:500 12.5px/1.6 "Segoe UI",sans-serif;color:#7d93b2}',
    '.tph-sempty b{display:block;color:#c3d3e8;font-weight:600;margin-bottom:4px}',
    '.tph-sname{padding:14px 20px 0;font:600 21px/1.2 "Segoe UI",sans-serif;color:#f2f7ff;letter-spacing:-.01em}',
    '.tph-smeta{padding:5px 20px 0;font:500 11.5px/1 "Segoe UI",sans-serif;color:#8ea4c2;letter-spacing:.05em}',
    '.tph-sgrid{display:grid;grid-template-columns:1fr 1fr;gap:1px;margin:14px 0 0;',
    '  background:rgba(88,140,190,.14);border-top:1px solid rgba(88,140,190,.14);',
    '  border-bottom:1px solid rgba(88,140,190,.14)}',
    '.tph-sc{background:#070d19;padding:11px 20px}',
    '.tph-scl{font:600 9.5px/1 "Segoe UI",sans-serif;letter-spacing:.15em;text-transform:uppercase;color:#7d93b2}',
    '.tph-scv{margin-top:6px;font:600 17px/1 ui-monospace,Consolas,monospace;color:#e6edf7;',
    '  font-variant-numeric:tabular-nums}',

    '.tph-prod{right:46px;top:556px;width:392px;padding-bottom:12px}',
    '.tph-prow{display:grid;grid-template-columns:20px 1fr auto;gap:11px;align-items:baseline;padding:7.5px 20px}',
    '.tph-pi{font:600 10.5px/1.4 ui-monospace,Consolas,monospace;color:#4d637f}',
    '.tph-pn{font:500 12.5px/1.35 "Segoe UI",sans-serif;color:#dbe6f5;overflow:hidden;',
    '  text-overflow:ellipsis;white-space:nowrap}',
    '.tph-pc{display:block;font:500 10px/1.3 "Segoe UI",sans-serif;color:#6d84a3;margin-top:1px}',
    '.tph-pv{font:600 12.5px/1.35 ui-monospace,Consolas,monospace;color:#f2f7ff;font-variant-numeric:tabular-nums}',

    /* ---- bottom ribbon ---- */
    '.tph-rib{left:46px;right:46px;bottom:112px;height:150px;padding:0 0 8px}',
    '.tph-ribh{display:flex;align-items:baseline;gap:14px;padding:12px 22px 0}',
    '.tph-ribh h3{margin:0;font:600 10.5px/1 "Segoe UI",sans-serif;letter-spacing:.16em;',
    '  text-transform:uppercase;color:#7d93b2}',
    '.tph-lg{display:flex;gap:14px;margin-left:auto;font:500 10.5px/1 "Segoe UI",sans-serif;color:#8ea4c2}',
    '.tph-lg span{display:flex;align-items:center;gap:6px}',
    '.tph-lg i{width:14px;height:2.5px;border-radius:2px;font-style:normal}',
    '.tph-ribsvg{display:block;width:100%;height:98px}',

    /* ---- nav tiles ---- */
    '.tph-nav{position:absolute;left:46px;right:46px;bottom:30px;height:66px;display:grid;',
    '  grid-template-columns:repeat(4,1fr);gap:14px;z-index:4}',
    '.tph-t{position:relative;display:flex;align-items:center;gap:14px;padding:0 20px;',
    '  border:1px solid rgba(88,140,190,.22);border-radius:12px;overflow:hidden;',
    '  background:linear-gradient(140deg,rgba(11,20,38,.80),rgba(6,11,22,.62));',
    '  color:inherit;text-align:left;font:inherit;cursor:pointer;transition:border-color .2s,transform .2s}',
    '.tph-t:hover{border-color:rgba(34,211,238,.55);transform:translateY(-2px)}',
    '.tph-t:focus-visible{outline:2px solid #22d3ee;outline-offset:2px}',
    '.tph-t::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;',
    '  background:linear-gradient(90deg,transparent,rgba(34,211,238,.85),transparent);',
    '  transform:scaleX(0);transition:transform .3s}',
    '.tph-t:hover::after{transform:scaleX(1)}',
    '.tph-ti{width:32px;height:32px;flex:0 0 auto;display:grid;place-items:center;border-radius:9px;',
    '  background:rgba(34,211,238,.10);border:1px solid rgba(34,211,238,.26)}',
    '.tph-ti svg{width:17px;height:17px;stroke:#22d3ee;fill:none;stroke-width:1.7;',
    '  stroke-linecap:round;stroke-linejoin:round}',
    '.tph-tt{font:600 13.5px/1.2 "Segoe UI",sans-serif;color:#eaf2ff}',
    '.tph-ts{font:500 10.5px/1.3 "Segoe UI",sans-serif;color:#7d93b2;margin-top:2px}',

    /* ---- globe tooltip ---- */
    '.tph-tip{position:absolute;z-index:6;pointer-events:none;opacity:0;transform:translate(-50%,-124%);',
    '  padding:9px 13px;border-radius:10px;border:1px solid rgba(34,211,238,.38);',
    '  background:rgba(6,12,24,.95);box-shadow:0 14px 40px -12px rgba(0,0,0,.95);',
    '  transition:opacity .13s;white-space:nowrap}',
    '.tph-tip.is-on{opacity:1}',
    '.tph-tipn{font:600 13px/1.2 "Segoe UI",sans-serif;color:#f2f7ff}',
    '.tph-tipr{font:500 10.5px/1 "Segoe UI",sans-serif;letter-spacing:.09em;text-transform:uppercase;margin-top:3px}',
    '.tph-tipv{font:600 12.5px/1 ui-monospace,Consolas,monospace;color:#22d3ee;margin-top:5px}',

    /* ---- hint + build stamp ---- */
    '.tph-hint{position:absolute;left:50%;bottom:292px;transform:translateX(-50%);z-index:4;',
    '  font:500 11px/1 "Segoe UI",sans-serif;letter-spacing:.13em;text-transform:uppercase;',
    '  color:#5a6f8c;pointer-events:none}',
    '.tph-build{position:absolute;right:14px;bottom:8px;z-index:6;pointer-events:none;',
    '  font:500 9.5px/1 ui-monospace,Consolas,monospace;color:#33445c;letter-spacing:.08em}',

    /* ---- states ---- */
    '.tph-fail{position:absolute;inset:0;z-index:9;display:grid;place-items:center;',
    '  background:#04060c;padding:40px;text-align:center}',
    '.tph-fail div{max-width:640px}',
    '.tph-fail b{display:block;font:600 17px/1.3 "Segoe UI",sans-serif;color:#f87171;margin-bottom:10px}',
    '.tph-fail p{margin:0;font:400 13px/1.65 "Segoe UI",sans-serif;color:#8ea4c2}',
    '.tph-fail code{display:block;margin-top:14px;font:400 11.5px/1.6 ui-monospace,Consolas,monospace;',
    '  color:#7d93b2;background:rgba(255,255,255,.03);border:1px solid rgba(88,140,190,.18);',
    '  border-radius:8px;padding:10px 12px;word-break:break-word}',
    '@media (prefers-reduced-motion:reduce){.tph-dot{animation:none}}'
  ].join('');

  /* -------------------------------------------------------------------------
   * 4. SMALL UTILITIES
   * ---------------------------------------------------------------------- */
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
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function rad(d) { return d * Math.PI / 180; }

  /* Money arrives as integer cents. Never divide before you have to. */
  function money(cents, digits) {
    if (!isNum(cents)) return '—';
    var v = cents / 100, a = Math.abs(v), s = v < 0 ? '-' : '';
    if (a >= 1e9) return s + (a / 1e9).toFixed(digits == null ? 2 : digits) + 'B';
    if (a >= 1e6) return s + (a / 1e6).toFixed(digits == null ? 2 : digits) + 'M';
    if (a >= 1e3) return s + (a / 1e3).toFixed(digits == null ? 1 : digits) + 'K';
    return s + a.toFixed(0);
  }
  function pct(bp, digits) {
    if (!isNum(bp)) return '—';
    return (bp / 100).toFixed(digits == null ? 1 : digits) + '%';
  }
  function signed(cents) {
    if (!isNum(cents)) return '—';
    return (cents >= 0 ? '+' : '') + money(cents);
  }
  function intFmt(n) {
    if (!isNum(n)) return '—';
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /* -------------------------------------------------------------------------
   * 5. MATRIX AND VECTOR MATH
   * Just enough of it. Column-major, same convention as WebGL expects.
   * ---------------------------------------------------------------------- */
  function m4() { return new Float32Array(16); }
  function m4ident(o) {
    o[0]=1;o[1]=0;o[2]=0;o[3]=0; o[4]=0;o[5]=1;o[6]=0;o[7]=0;
    o[8]=0;o[9]=0;o[10]=1;o[11]=0; o[12]=0;o[13]=0;o[14]=0;o[15]=1; return o;
  }
  function m4persp(o, fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    o[0]=f/aspect;o[1]=0;o[2]=0;o[3]=0;
    o[4]=0;o[5]=f;o[6]=0;o[7]=0;
    o[8]=0;o[9]=0;o[10]=(far+near)*nf;o[11]=-1;
    o[12]=0;o[13]=0;o[14]=2*far*near*nf;o[15]=0; return o;
  }
  function m4look(o, eye, ctr, up) {
    var zx=eye[0]-ctr[0], zy=eye[1]-ctr[1], zz=eye[2]-ctr[2];
    var zl=Math.hypot(zx,zy,zz)||1; zx/=zl; zy/=zl; zz/=zl;
    var xx=up[1]*zz-up[2]*zy, xy=up[2]*zx-up[0]*zz, xz=up[0]*zy-up[1]*zx;
    var xl=Math.hypot(xx,xy,xz)||1; xx/=xl; xy/=xl; xz/=xl;
    var yx=zy*xz-zz*xy, yy=zz*xx-zx*xz, yz=zx*xy-zy*xx;
    o[0]=xx;o[1]=yx;o[2]=zx;o[3]=0;
    o[4]=xy;o[5]=yy;o[6]=zy;o[7]=0;
    o[8]=xz;o[9]=yz;o[10]=zz;o[11]=0;
    o[12]=-(xx*eye[0]+xy*eye[1]+xz*eye[2]);
    o[13]=-(yx*eye[0]+yy*eye[1]+yz*eye[2]);
    o[14]=-(zx*eye[0]+zy*eye[1]+zz*eye[2]);
    o[15]=1; return o;
  }
  function m4mul(o, a, b) {
    for (var c = 0; c < 4; c++) {
      var b0=b[c*4], b1=b[c*4+1], b2=b[c*4+2], b3=b[c*4+3];
      o[c*4]   = a[0]*b0 + a[4]*b1 + a[8]*b2  + a[12]*b3;
      o[c*4+1] = a[1]*b0 + a[5]*b1 + a[9]*b2  + a[13]*b3;
      o[c*4+2] = a[2]*b0 + a[6]*b1 + a[10]*b2 + a[14]*b3;
      o[c*4+3] = a[3]*b0 + a[7]*b1 + a[11]*b2 + a[15]*b3;
    }
    return o;
  }
  function m4rotY(o, r) {
    var s=Math.sin(r), c=Math.cos(r); m4ident(o);
    o[0]=c;o[2]=-s;o[8]=s;o[10]=c; return o;
  }
  function m4scale(o, s) { m4ident(o); o[0]=o[5]=o[10]=s; return o; }
  function xform(out, m, x, y, z) {
    var w = m[3]*x + m[7]*y + m[11]*z + m[15];
    out[0] = (m[0]*x + m[4]*y + m[8]*z  + m[12]) / w;
    out[1] = (m[1]*x + m[5]*y + m[9]*z  + m[13]) / w;
    out[2] = (m[2]*x + m[6]*y + m[10]*z + m[14]) / w;
    out[3] = w;
    return out;
  }
  /* Latitude and longitude to a point on the unit sphere. */
  function ll2v(latDeg, lonDeg, r) {
    var la = rad(latDeg), lo = rad(lonDeg), cl = Math.cos(la);
    return [r * cl * Math.cos(lo), r * Math.sin(la), -r * cl * Math.sin(lo)];
  }

  /* -------------------------------------------------------------------------
   * 6. SHADERS
   * ---------------------------------------------------------------------- */
  var VS_HEAD = '#version 300 es\nprecision highp float;\n';
  var FS_HEAD = '#version 300 es\nprecision highp float;\n';

  /* cross(a,b) collapses to the zero vector when a and b are parallel, and
     normalize(vec3(0)) is 0/0, which is NaN. A NaN vertex does not vanish, it
     smears the whole triangle strip across the screen as a white shard. Both
     places that need a screen-facing perpendicular hit this exactly at the
     centre of the view, which is where the stores are, so it is not a rare
     edge case here: it is the default state. */
  var GLSL_PERP =
    'vec3 safePerp(vec3 a, vec3 b){' +
    '  vec3 c = cross(a, b);' +
    '  float l = length(c);' +
    '  if (l > 1e-5) return c / l;' +
    '  vec3 alt = abs(a.y) < 0.9 ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0);' +
    '  return normalize(cross(a, alt));' +
    '}';

  var SH = {
    star: [
      VS_HEAD +
      'in vec3 aPos; in float aSeed;' +
      'uniform mat4 uVP; uniform float uTime;' +
      'out float vTw;' +
      'void main(){' +
      '  vec4 p = uVP * vec4(aPos,1.0);' +
      '  gl_Position = p;' +
      '  vTw = 0.45 + 0.55 * (0.5 + 0.5*sin(uTime*(0.5+aSeed*1.9) + aSeed*31.0));' +
      '  gl_PointSize = (0.7 + aSeed*2.1) * vTw;' +
      '}',
      FS_HEAD +
      'in float vTw; out vec4 o;' +
      'void main(){' +
      '  vec2 c = gl_PointCoord - 0.5; float d = length(c);' +
      '  if (d > 0.5) discard;' +
      '  float a = smoothstep(0.5, 0.0, d) * vTw * 0.85;' +
      '  o = vec4(vec3(0.72,0.83,1.0) * a, a);' +
      '}'
    ],

    /* The solid globe body. Its only jobs are to occlude the far side and to
       give the dot shell something to sit on. */
    core: [
      VS_HEAD +
      'in vec3 aPos;' +
      'uniform mat4 uMVP; uniform mat4 uModel;' +
      'out vec3 vW; out vec3 vN;' +
      'void main(){ vec4 w = uModel * vec4(aPos,1.0); vW = w.xyz; vN = normalize(mat3(uModel)*aPos);' +
      '  gl_Position = uMVP * vec4(aPos,1.0); }',
      FS_HEAD +
      'in vec3 vW; in vec3 vN; uniform vec3 uCam; out vec4 o;' +
      'void main(){' +
      '  vec3 v = normalize(uCam - vW);' +
      '  float f = 1.0 - max(dot(normalize(vN), v), 0.0);' +
      '  vec3 base = mix(vec3(0.012,0.024,0.052), vec3(0.026,0.062,0.112), vN.y*0.5+0.5);' +
      '  base += vec3(0.03,0.15,0.26) * pow(f, 3.2) * 0.75;' +
      '  o = vec4(base, 1.0);' +
      '}'
    ],

    /* The dot shell. aHeat is revenue-weighted proximity to the real stores,
       computed on the CPU once per data change. Back-facing dots are discarded
       so the sphere reads solid without a second depth pass. */
    dots: [
      VS_HEAD +
      'in vec3 aPos; in float aHeat;' +
      'uniform mat4 uMVP; uniform mat4 uModel; uniform vec3 uCam;' +
      'uniform float uPx; uniform float uTime; uniform float uReveal;' +
      'out float vHeat; out float vFace;' +
      'void main(){' +
      '  vec3 w = (uModel * vec4(aPos,1.0)).xyz;' +
      '  vec3 n = normalize(w);' +
      '  vFace = dot(n, normalize(uCam - w));' +
      '  vHeat = aHeat;' +
      '  float grow = smoothstep(0.0, 1.0, uReveal);' +
      '  vec4 p = uMVP * vec4(aPos,1.0);' +
      '  gl_Position = p;' +
      '  float pulse = 1.0 + 0.26 * aHeat * sin(uTime*2.1 + aPos.x*7.0 + aPos.y*5.0);' +
      '  gl_PointSize = uPx * (0.62 + aHeat*1.7) * pulse * grow / max(p.w, 0.0001);' +
      '}',
      FS_HEAD +
      'in float vHeat; in float vFace; out vec4 o;' +
      'void main(){' +
      '  if (vFace <= 0.015) discard;' +
      '  vec2 c = gl_PointCoord - 0.5; float d = length(c);' +
      '  if (d > 0.5) discard;' +
      '  float a = smoothstep(0.5, 0.04, d);' +
      /* These are ADDITIVELY blended and they overlap heavily where the stores
         cluster, so the palette has to be picked for what it looks like after
         it stacks, not on its own. Full-brightness yellow here reads as a
         white blob over North America. */
      '  vec3 cold = vec3(0.075,0.170,0.295);' +
      '  vec3 mid  = vec3(0.105,0.640,0.760);' +
      '  vec3 hot  = vec3(0.780,0.520,0.130);' +
      '  vec3 col = mix(cold, mid, smoothstep(0.0, 0.46, vHeat));' +
      '  col = mix(col, hot, smoothstep(0.54, 1.0, vHeat));' +
      '  float rim = smoothstep(0.0, 0.42, vFace);' +
      '  o = vec4(col, a * (0.22 + 0.46*vHeat) * rim);' +
      '}'
    ],

    /* Graticule. Faint, and it fades at the limb so it never looks like a cage. */
    grid: [
      VS_HEAD +
      'in vec3 aPos;' +
      'uniform mat4 uMVP; uniform mat4 uModel; uniform vec3 uCam;' +
      'out float vFace;' +
      'void main(){' +
      '  vec3 w = (uModel * vec4(aPos,1.0)).xyz;' +
      '  vFace = dot(normalize(w), normalize(uCam - w));' +
      '  gl_Position = uMVP * vec4(aPos,1.0);' +
      '}',
      FS_HEAD +
      'in float vFace; out vec4 o;' +
      'void main(){' +
      '  if (vFace <= 0.0) discard;' +
      '  float a = smoothstep(0.0, 0.55, vFace) * 0.16;' +
      '  o = vec4(vec3(0.36,0.62,0.86) * a, a);' +
      '}'
    ],

    /* Atmosphere. A slightly larger sphere, front faces culled, additive. */
    atmo: [
      VS_HEAD +
      'in vec3 aPos; uniform mat4 uMVP; uniform mat4 uModel;' +
      'out vec3 vW; out vec3 vN;' +
      'void main(){ vec4 w = uModel * vec4(aPos,1.0); vW = w.xyz; vN = normalize(mat3(uModel)*aPos);' +
      '  gl_Position = uMVP * vec4(aPos,1.0); }',
      FS_HEAD +
      'in vec3 vW; in vec3 vN; uniform vec3 uCam; out vec4 o;' +
      'void main(){' +
      '  vec3 v = normalize(uCam - vW);' +
      '  float f = pow(1.0 - abs(dot(normalize(vN), v)), 3.1);' +
      '  o = vec4(vec3(0.106,0.55,0.92) * f * 1.35, f);' +
      '}'
    ],

    /* Revenue arcs, drawn as screen-facing ribbons so they have real thickness.
       gl.LINES would be clamped to one pixel on almost every browser. */
    arc: [
      /* SCREEN-SPACE ribbon expansion.
         The obvious approach, offsetting along cross(tangent, viewDir), has a
         singularity wherever the arc runs toward or away from the camera. That
         is not a rare case here: every arc ENDS on a store, the stores sit near
         the middle of the view, and a lifted arc leaves the surface almost
         radially, which is almost exactly the view direction. The result is a
         ribbon that twists 90 degrees at both ends and paints a bright quad.
         Projecting first and taking the 2D perpendicular has no such
         singularity, and aW becomes an honest fraction of viewport height. */
      VS_HEAD +
      'in vec3 aPos; in vec3 aTan; in float aSide; in float aT; in float aW; in vec3 aCol;' +
      'uniform mat4 uMVP; uniform float uAspect;' +
      'out float vT; out float vSide; out vec3 vCol;' +
      'void main(){' +
      '  vec4 clip  = uMVP * vec4(aPos, 1.0);' +
      '  vec4 clipT = uMVP * vec4(aPos + aTan * 0.02, 1.0);' +
      '  vec2 p0 = clip.xy  / max(clip.w,  1e-5);' +
      '  vec2 p1 = clipT.xy / max(clipT.w, 1e-5);' +
      '  vec2 d  = (p1 - p0) * vec2(uAspect, 1.0);' +
      '  float dl = length(d);' +
      '  vec2 dir = dl > 1e-6 ? d / dl : vec2(1.0, 0.0);' +
      '  vec2 nrm = vec2(-dir.y, dir.x) / vec2(uAspect, 1.0);' +
      '  clip.xy += nrm * (aSide * aW) * clip.w;' +
      '  vT = aT; vSide = aSide; vCol = aCol;' +
      '  gl_Position = clip;' +
      '}',
      FS_HEAD +
      'in float vT; in float vSide; in vec3 vCol;' +
      'uniform float uTime; out vec4 o;' +
      'void main(){' +
      '  float edge = 1.0 - abs(vSide);' +
      '  float body = smoothstep(0.0, 0.62, edge);' +
      '  float ends = smoothstep(0.0, 0.13, vT) * smoothstep(1.0, 0.87, vT);' +
      '  float flow = fract(vT * 2.4 - uTime * 0.42);' +
      '  float comet = smoothstep(0.42, 1.0, flow) * 0.72;' +
      '  float a = body * ends * (0.62 + comet * 0.85);' +
      '  o = vec4(vCol * (0.74 + comet * 0.40) * a, a);' +
      '}'
    ],

    /* Store pins: camera-facing quads built in the vertex shader, plus a beam
       quad that stands off the surface. */
    pin: [
      VS_HEAD + GLSL_PERP +
      'in vec3 aPos; in vec2 aCorner; in float aScale; in vec3 aCol; in float aKind; in float aIdx;' +
      'uniform mat4 uMVP; uniform mat4 uModel; uniform mat4 uView; uniform vec3 uCam;' +
      'uniform float uTime; uniform float uSel;' +
      'out vec2 vC; out vec3 vCol; out float vKind; out float vFace; out float vHot;' +
      'void main(){' +
      '  vec3 w = (uModel * vec4(aPos,1.0)).xyz;' +
      '  vec3 n = normalize(w);' +
      '  vFace = dot(n, normalize(uCam - w));' +
      '  vec3 right = vec3(uView[0][0], uView[1][0], uView[2][0]);' +
      '  vec3 up    = vec3(uView[0][1], uView[1][1], uView[2][1]);' +
      '  float sel = (abs(uSel - aIdx) < 0.5) ? 1.0 : 0.0;' +
      '  vHot = sel;' +
      '  float s = aScale * (1.0 + 0.22*sin(uTime*2.0 + aIdx*1.7)) * (1.0 + sel*0.55);' +
      '  vec3 wp;' +
      '  if (aKind < 0.5) {' +
      '    wp = w + (right * aCorner.x + up * aCorner.y) * s;' +
      '  } else {' +
      '    vec3 side = safePerp(n, normalize(uCam - w));' +
      '    float h = 0.055 + 1.60 * aScale;' +
      '    wp = w + n * (aCorner.y * h) + side * (aCorner.x * s * 0.20);' +
      '  }' +
      '  vC = aCorner; vCol = aCol; vKind = aKind;' +
      '  gl_Position = uMVP * inverse(uModel) * vec4(wp, 1.0);' +
      '}',
      FS_HEAD +
      'in vec2 vC; in vec3 vCol; in float vKind; in float vFace; in float vHot;' +
      'uniform float uTime; out vec4 o;' +
      'void main(){' +
      '  if (vFace <= -0.05) discard;' +
      '  float vis = smoothstep(-0.05, 0.25, vFace);' +
      '  float a;' +
      '  if (vKind < 0.5) {' +
      '    float d = length(vC);' +
      '    if (d > 1.0) discard;' +
      '    float core = smoothstep(0.40, 0.06, d) * 0.62;' +
      '    float halo = smoothstep(1.0, 0.28, d) * 0.24;' +
      '    float ring = smoothstep(0.06, 0.0, abs(d - (0.52 + 0.42*fract(uTime*0.42)))) * 0.55;' +
      '    a = (core + halo + ring * (0.4 + vHot)) * vis;' +
      '    o = vec4(vCol * (0.80 + vHot*0.75), a);' +
      '  } else {' +
      '    float fade = 1.0 - clamp(vC.y, 0.0, 1.0);' +
      '    a = fade * fade * 0.30 * (1.0 - abs(vC.x)) * vis * (0.50 + vHot*0.8);' +
      '    o = vec4(vCol * 1.15, a);' +
      '  }' +
      '}'
    ]
  };

  /* -------------------------------------------------------------------------
   * 7. GL PLUMBING
   * ---------------------------------------------------------------------- */
  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('shader compile failed: ' + log);
    }
    return s;
  }
  function program(gl, vsSrc, fsSrc) {
    var p = gl.createProgram();
    var vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
    var fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      var log = gl.getProgramInfoLog(p);
      gl.deleteProgram(p);
      throw new Error('program link failed: ' + log);
    }
    var o = { p: p, a: {}, u: {} };
    var na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (var i = 0; i < na; i++) {
      var ai = gl.getActiveAttrib(p, i);
      o.a[ai.name] = gl.getAttribLocation(p, ai.name);
    }
    var nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var j = 0; j < nu; j++) {
      var ui = gl.getActiveUniform(p, j);
      o.u[ui.name] = gl.getUniformLocation(p, ui.name);
    }
    return o;
  }
  /* Attribute arrays are GLOBAL state, not per-program. The arc program
     enables six of them; the star program that runs next frame uses two and
     leaves four enabled, still pointing at the arc buffers, which are a
     different length. That is undefined behaviour and on some drivers the
     draw is simply dropped. Clear them on every program switch. */
  var MAX_ATTR = 8;
  function useProg(gl, prog) {
    gl.useProgram(prog.p);
    for (var i = 0; i < MAX_ATTR; i++) gl.disableVertexAttribArray(i);
  }

  function buffer(gl, data, target) {
    var b = gl.createBuffer();
    var t = target || gl.ARRAY_BUFFER;
    gl.bindBuffer(t, b);
    gl.bufferData(t, data, gl.STATIC_DRAW);
    return b;
  }
  function attrib(gl, prog, name, buf, size, stride, offset, type) {
    var loc = prog.a[name];
    if (loc == null || loc < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, type || gl.FLOAT, false, stride || 0, offset || 0);
  }

  /* -------------------------------------------------------------------------
   * 8. GEOMETRY
   * ---------------------------------------------------------------------- */
  function sphereMesh(seg, rings) {
    var pos = [], idx = [];
    for (var y = 0; y <= rings; y++) {
      var v = y / rings, phi = v * Math.PI;
      for (var x = 0; x <= seg; x++) {
        var u = x / seg, th = u * Math.PI * 2;
        pos.push(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
      }
    }
    for (var yy = 0; yy < rings; yy++) {
      for (var xx = 0; xx < seg; xx++) {
        var a = yy * (seg + 1) + xx, b = a + seg + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    return { pos: new Float32Array(pos), idx: new Uint16Array(idx) };
  }

  /* Fibonacci sphere: the only distribution that looks even without banding. */
  function fibPoints(n) {
    var out = new Float32Array(n * 3);
    var ga = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < n; i++) {
      var y = 1 - (i / (n - 1)) * 2;
      var r = Math.sqrt(Math.max(0, 1 - y * y));
      var th = ga * i;
      out[i * 3] = Math.cos(th) * r;
      out[i * 3 + 1] = y;
      out[i * 3 + 2] = Math.sin(th) * r;
    }
    return out;
  }

  function graticule() {
    var pos = [], i, j, la, lo, n = 96;
    for (i = -60; i <= 60; i += 30) {
      la = rad(i);
      for (j = 0; j < n; j++) {
        var a0 = (j / n) * Math.PI * 2, a1 = ((j + 1) / n) * Math.PI * 2, c = Math.cos(la), s = Math.sin(la);
        pos.push(c * Math.cos(a0), s, c * Math.sin(a0), c * Math.cos(a1), s, c * Math.sin(a1));
      }
    }
    for (i = 0; i < 360; i += 30) {
      lo = rad(i);
      for (j = 0; j < n / 2; j++) {
        var p0 = (j / (n / 2)) * Math.PI - Math.PI / 2, p1 = ((j + 1) / (n / 2)) * Math.PI - Math.PI / 2;
        pos.push(Math.cos(p0) * Math.cos(lo), Math.sin(p0), Math.cos(p0) * Math.sin(lo),
                 Math.cos(p1) * Math.cos(lo), Math.sin(p1), Math.cos(p1) * Math.sin(lo));
      }
    }
    return new Float32Array(pos);
  }

  function stars(n) {
    var pos = new Float32Array(n * 3), seed = new Float32Array(n), s = 1234567;
    function rnd() { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }
    for (var i = 0; i < n; i++) {
      var u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      var d = 14 + rnd() * 22;
      pos[i * 3] = r * Math.cos(th) * d;
      pos[i * 3 + 1] = u * d;
      pos[i * 3 + 2] = r * Math.sin(th) * d;
      seed[i] = rnd();
    }
    return { pos: pos, seed: seed };
  }

  /* Great-circle arc, lifted off the surface by an amount that scales with how
     far it travels, then widened into a ribbon. */
  function arcRibbon(a, b, lift, width, col, out) {
    var dot = clamp(a[0]*b[0] + a[1]*b[1] + a[2]*b[2], -1, 1);
    var omega = Math.acos(dot);
    if (omega < 1e-4) return;
    var so = Math.sin(omega);
    /* Lift has to scale with how far the arc actually travels. Denver to
       Boulder is 0.006 rad apart; a fixed lift turns that 35km hop into a
       needle standing 22% of the globe radius straight up, which renders as a
       bright vertical sliver and looks like a glitch. */
    lift = lift * clamp(omega / 0.30, 0.06, 1.0);
    var prev = null;
    for (var i = 0; i <= ARC_SEGS; i++) {
      var t = i / ARC_SEGS;
      var s0 = Math.sin((1 - t) * omega) / so, s1 = Math.sin(t * omega) / so;
      var x = a[0]*s0 + b[0]*s1, y = a[1]*s0 + b[1]*s1, z = a[2]*s0 + b[2]*s1;
      var h = 1 + lift * Math.sin(Math.PI * t);
      var px = x*h, py = y*h, pz = z*h;
      var tx, ty, tz;
      if (prev) { tx = px - prev[0]; ty = py - prev[1]; tz = pz - prev[2]; }
      else      { tx = 1e-4; ty = 1e-4; tz = 1e-4; }
      if (i < ARC_SEGS) {
        var t2 = (i + 1) / ARC_SEGS;
        var q0 = Math.sin((1 - t2) * omega) / so, q1 = Math.sin(t2 * omega) / so;
        var h2 = 1 + lift * Math.sin(Math.PI * t2);
        tx = (a[0]*q0 + b[0]*q1) * h2 - px;
        ty = (a[1]*q0 + b[1]*q1) * h2 - py;
        tz = (a[2]*q0 + b[2]*q1) * h2 - pz;
      }
      var tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      for (var k = 0; k < 2; k++) {
        out.pos.push(px, py, pz);
        out.tan.push(tx, ty, tz);
        out.side.push(k === 0 ? -1 : 1);
        out.t.push(t);
        out.w.push(width);
        out.col.push(col[0], col[1], col[2]);
      }
      prev = [px, py, pz];
    }
    out.strips.push(ARC_SEGS * 2 + 2);
  }

  /* -------------------------------------------------------------------------
   * 9. PERSISTENT GL STATE
   * This object outlives every DOM replacement. It is the whole trick.
   * ---------------------------------------------------------------------- */
  var G = window.__tphGL || (window.__tphGL = {
    canvas: null, gl: null, raf: 0, progs: null, geo: null,
    scene: null, lost: false, w: 0, h: 0, dpr: 1
  });

  /* The opening shot. Azimuth is derived, not guessed: for a point at
     longitude L, ll2v puts it at x = cos(lat)cos(L), z = -cos(lat)sin(L), so
     the camera azimuth that faces it is -radians(L). The US centroid is near
     98W, hence 1.71. Get this wrong by pi and every store is on the far side
     of the globe and the page looks empty for no visible reason. */
  /* Distance is derived too. A sphere of radius r at distance d covers
     r / (d * tan(fov/2)) of the viewport HEIGHT, so for the dot shell (r=1) to
     read at ~55% of frame with a 38 degree fov: d = 1 / (0.55 * tan(19)) = 5.3. */
  var HOME_VIEW = { az: 1.71, el: 0.58, dist: 5.4 };

  /* State is versioned. It lives on window and survives the DOM replacement,
     which is the point, but it must NOT survive a build that changes what the
     numbers mean. */
  var S = window.__tphState;
  if (!S || S.v !== VERSION) {
    S = window.__tphState = {
      v: VERSION,
      az: HOME_VIEW.az, el: HOME_VIEW.el, dist: HOME_VIEW.dist,
      tAz: HOME_VIEW.az, tEl: HOME_VIEW.el, tDist: HOME_VIEW.dist,
      spin: true, sel: -1, region: null, t0: 0, reveal: 0, drag: false
    };
  }

  var D = null;   /* decoded data */
  var V = {};     /* per-render view handles */

  function ensureCanvas() {
    if (G.canvas && G.canvas.getContext) return G.canvas;
    var c = document.createElement('canvas');
    c.className = NS + '-gl';
    c.setAttribute('aria-label', 'Interactive globe of store performance. Drag to rotate.');
    c.setAttribute('role', 'img');
    G.canvas = c;
    return c;
  }

  function ensureGL() {
    if (G.gl && !G.gl.isContextLost()) return G.gl;
    var c = ensureCanvas();
    var opts = { alpha: false, antialias: true, depth: true, premultipliedAlpha: false,
                 powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false };
    var gl = c.getContext('webgl2', opts);
    if (!gl) throw new Error('WebGL2 is not available in this browser or tenant configuration.');
    G.gl = gl;
    G.progs = null;
    G.geo = null;
    c.addEventListener('webglcontextlost', function (e) {
      e.preventDefault(); G.lost = true;
      if (G.raf) { cancelAnimationFrame(G.raf); G.raf = 0; }
    }, false);
    c.addEventListener('webglcontextrestored', function () {
      G.lost = false; G.progs = null; G.geo = null; G.scene = null; schedule();
    }, false);
    return gl;
  }

  function ensurePrograms(gl) {
    if (G.progs) return G.progs;
    G.progs = {
      star: program(gl, SH.star[0], SH.star[1]),
      core: program(gl, SH.core[0], SH.core[1]),
      dots: program(gl, SH.dots[0], SH.dots[1]),
      grid: program(gl, SH.grid[0], SH.grid[1]),
      atmo: program(gl, SH.atmo[0], SH.atmo[1]),
      arc:  program(gl, SH.arc[0],  SH.arc[1]),
      pin:  program(gl, SH.pin[0],  SH.pin[1])
    };
    return G.progs;
  }

  function ensureStaticGeo(gl) {
    if (G.geo) return G.geo;
    var sm = sphereMesh(72, 48);
    var st = stars(STAR_COUNT);
    var gr = graticule();
    var fp = fibPoints(DOT_COUNT);
    G.geo = {
      sphPos: buffer(gl, sm.pos),
      sphIdx: buffer(gl, sm.idx, gl.ELEMENT_ARRAY_BUFFER),
      sphN: sm.idx.length,
      starPos: buffer(gl, st.pos), starSeed: buffer(gl, st.seed), starN: STAR_COUNT,
      gridPos: buffer(gl, gr), gridN: gr.length / 3,
      dotPos: buffer(gl, fp), dotRaw: fp, dotN: DOT_COUNT,
      dotHeat: gl.createBuffer()
    };
    return G.geo;
  }

  /* -------------------------------------------------------------------------
   * 10. DECODE
   * ---------------------------------------------------------------------- */
  function decode(raw) {
    var d = {
      meta: raw.meta || {},
      kpi: raw.kpi || {},
      stores: [], regions: [], trend: [], products: [], cats: []
    };
    (raw.stores || []).forEach(function (s, i) {
      var g = GEO[s[1]] || [0, 0];
      d.stores.push({
        i: i, key: s[0], code: s[1], name: s[2], city: s[3], state: s[4],
        region: s[5], tier: s[6], rev: s[7], gmBp: s[8], op: s[9], varc: s[10],
        units: s[11], sqft: s[12], lat: g[0], lon: g[1],
        v: ll2v(g[0], g[1], GLOBE_R)
      });
    });
    (raw.regions || []).forEach(function (r) {
      d.regions.push({ name: r[0], rev: r[1], gmBp: r[2], op: r[3], n: r[4] });
    });
    (raw.trend || []).forEach(function (t) {
      d.trend.push({ key: t[0], label: t[1], rev: t[2], gp: t[3], op: t[4], budget: t[5] });
    });
    (raw.products || []).forEach(function (p) {
      d.products.push({ sku: p[0], name: p[1], cat: p[2], rev: p[3], units: p[4], margin: p[5] });
    });
    (raw.cats || []).forEach(function (c) {
      d.cats.push({ name: c[0], rev: c[1], units: c[2], skus: c[3] });
    });
    d.maxStoreRev = d.stores.reduce(function (m, s) { return Math.max(m, s.rev || 0); }, 1);
    d.totalRev = d.regions.reduce(function (m, r) { return m + (r.rev || 0); }, 0) ||
                 d.stores.reduce(function (m, s) { return m + (s.rev || 0); }, 0);
    return d;
  }

  function activeStores() {
    if (!D) return [];
    if (!S.region) return D.stores;
    return D.stores.filter(function (s) { return s.region === S.region; });
  }

  /* Heat per globe dot: revenue-weighted gaussian falloff from each live store.
     Recomputed only when the data or the region filter changes, never per frame. */
  function computeHeat(gl) {
    var geo = G.geo, raw = geo.dotRaw, n = geo.dotN;
    var heat = new Float32Array(n);
    var list = activeStores();
    if (!list.length) { gl.bindBuffer(gl.ARRAY_BUFFER, geo.dotHeat); gl.bufferData(gl.ARRAY_BUFFER, heat, gl.DYNAMIC_DRAW); return; }
    var sigma = 0.24, inv = 1 / (2 * sigma * sigma), max = 0;
    var pts = list.map(function (s) {
      return { v: s.v, w: 0.30 + 0.70 * (s.rev / D.maxStoreRev) };
    });
    for (var i = 0; i < n; i++) {
      var x = raw[i * 3], y = raw[i * 3 + 1], z = raw[i * 3 + 2], acc = 0;
      for (var k = 0; k < pts.length; k++) {
        var p = pts[k].v;
        var dt = clamp(x * p[0] + y * p[1] + z * p[2], -1, 1);
        var ang = Math.acos(dt);
        acc += pts[k].w * Math.exp(-ang * ang * inv);
      }
      heat[i] = acc;
      if (acc > max) max = acc;
    }
    if (max > 0) for (var j = 0; j < n; j++) heat[j] = Math.pow(heat[j] / max, 0.72);
    gl.bindBuffer(gl.ARRAY_BUFFER, geo.dotHeat);
    gl.bufferData(gl.ARRAY_BUFFER, heat, gl.DYNAMIC_DRAW);
  }

  /* Arcs join each store to the strongest store in its region, and each region
     leader to the company leader. Thickness is combined revenue. */
  function buildScene(gl) {
    var list = activeStores();
    var out = { pos: [], tan: [], side: [], t: [], w: [], col: [], strips: [] };
    var byRegion = {};
    list.forEach(function (s) {
      if (!byRegion[s.region] || s.rev > byRegion[s.region].rev) byRegion[s.region] = s;
    });
    var leaders = Object.keys(byRegion).map(function (k) { return byRegion[k]; });
    var top = leaders.reduce(function (m, s) { return (!m || s.rev > m.rev) ? s : m; }, null);

    list.forEach(function (s) {
      var hub = byRegion[s.region];
      if (!hub || hub.code === s.code) return;
      var c = REGION_COLOR[s.region] || [0.13, 0.83, 0.93];
      var w = 0.0080 + 0.0140 * (s.rev / D.maxStoreRev);
      arcRibbon(s.v, hub.v, 0.22, w, c, out);
    });
    leaders.forEach(function (s) {
      if (!top || s.code === top.code) return;
      var c = REGION_COLOR[s.region] || [0.13, 0.83, 0.93];
      arcRibbon(s.v, top.v, 0.52, 0.022, c, out);
    });

    var arc = null;
    if (out.pos.length) {
      arc = {
        pos: buffer(gl, new Float32Array(out.pos)),
        tan: buffer(gl, new Float32Array(out.tan)),
        side: buffer(gl, new Float32Array(out.side)),
        t: buffer(gl, new Float32Array(out.t)),
        w: buffer(gl, new Float32Array(out.w)),
        col: buffer(gl, new Float32Array(out.col)),
        strips: out.strips
      };
    }

    /* Pins: 6 verts for the glow quad, 6 for the beam. */
    var pp = [], pc = [], ps = [], pk = [], pcol = [], pi = [];
    var quad = [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]];
    var beam = [[-1,0],[1,0],[1,1],[-1,0],[1,1],[-1,1]];
    list.forEach(function (s) {
      var c = REGION_COLOR[s.region] || [0.13, 0.83, 0.93];
      var sc = 0.016 + 0.028 * Math.sqrt(s.rev / D.maxStoreRev);
      var v = s.v;
      quad.forEach(function (q) {
        pp.push(v[0], v[1], v[2]); pc.push(q[0], q[1]); ps.push(sc);
        pcol.push(c[0], c[1], c[2]); pk.push(0); pi.push(s.i);
      });
    });
    var pin = pp.length ? {
      pos: buffer(gl, new Float32Array(pp)),
      corner: buffer(gl, new Float32Array(pc)),
      scale: buffer(gl, new Float32Array(ps)),
      col: buffer(gl, new Float32Array(pcol)),
      kind: buffer(gl, new Float32Array(pk)),
      idx: buffer(gl, new Float32Array(pi)),
      n: pp.length / 3
    } : null;

    if (G.scene) freeScene(gl, G.scene);
    G.scene = { arc: arc, pin: pin, list: list };
  }

  function freeScene(gl, sc) {
    ['arc', 'pin'].forEach(function (k) {
      var o = sc[k]; if (!o) return;
      Object.keys(o).forEach(function (b) {
        if (o[b] && o[b] instanceof WebGLBuffer) gl.deleteBuffer(o[b]);
      });
    });
  }

  function rebuild() {
    var gl = G.gl; if (!gl || gl.isContextLost()) return;
    ensurePrograms(gl);
    ensureStaticGeo(gl);
    computeHeat(gl);
    buildScene(gl);
  }

  /* -------------------------------------------------------------------------
   * 11. DRAW
   * ---------------------------------------------------------------------- */
  var mProj = m4(), mView = m4(), mVP = m4(), mModel = m4(), mMVP = m4(), mTmp = m4();
  var camPos = [0, 0, 0];

  function resize() {
    var c = G.canvas, host = c.parentNode;
    if (!host) return false;
    var r = host.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    var w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (w === G.w && h === G.h && dpr === G.dpr) return false;
    c.width = w; c.height = h; G.w = w; G.h = h; G.dpr = dpr;
    return true;
  }

  function draw(now) {
    G.raf = requestAnimationFrame(draw);
    var gl = G.gl;
    if (!gl || gl.isContextLost() || !D || !G.scene) return;
    if (!G.canvas.parentNode) return;   /* detached between frames, skip */

    resize();
    var t = (now - S.t0) / 1000;

    /* eased camera */
    if (S.spin && !S.drag) S.tAz += 0.0016;
    S.az   = lerp(S.az,   S.tAz,   0.12);
    S.el   = lerp(S.el,   S.tEl,   0.12);
    S.dist = lerp(S.dist, S.tDist, 0.10);
    S.reveal = Math.min(1, S.reveal + 0.018);

    var ce = Math.cos(S.el), se = Math.sin(S.el);
    camPos[0] = S.dist * ce * Math.cos(S.az);
    camPos[1] = S.dist * se;
    camPos[2] = S.dist * ce * Math.sin(S.az);

    var aspect = G.w / Math.max(1, G.h);
    m4persp(mProj, rad(38), aspect, 0.1, 100);
    m4look(mView, camPos, [0, 0, 0], [0, 1, 0]);
    m4mul(mVP, mProj, mView);
    m4ident(mModel);
    m4mul(mMVP, mVP, mModel);

    gl.viewport(0, 0, G.w, G.h);
    gl.clearColor(0.016, 0.024, 0.047, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    var P = G.progs, geo = G.geo, sc = G.scene;

    /* stars: additive, no depth write */
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    useProg(gl, P.star);
    gl.uniformMatrix4fv(P.star.u.uVP, false, mVP);
    gl.uniform1f(P.star.u.uTime, t);
    attrib(gl, P.star, 'aPos', geo.starPos, 3);
    attrib(gl, P.star, 'aSeed', geo.starSeed, 1);
    gl.drawArrays(gl.POINTS, 0, geo.starN);

    /* globe core: opaque, writes depth so everything behind is occluded */
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    useProg(gl, P.core);
    m4scale(mTmp, 0.995); m4mul(mTmp, mModel, mTmp);
    gl.uniformMatrix4fv(P.core.u.uMVP, false, m4mul(m4(), mVP, mTmp));
    gl.uniformMatrix4fv(P.core.u.uModel, false, mTmp);
    gl.uniform3fv(P.core.u.uCam, camPos);
    attrib(gl, P.core, 'aPos', geo.sphPos, 3);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geo.sphIdx);
    gl.drawElements(gl.TRIANGLES, geo.sphN, gl.UNSIGNED_SHORT, 0);

    /* graticule */
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    useProg(gl, P.grid);
    gl.uniformMatrix4fv(P.grid.u.uMVP, false, mMVP);
    gl.uniformMatrix4fv(P.grid.u.uModel, false, mModel);
    gl.uniform3fv(P.grid.u.uCam, camPos);
    attrib(gl, P.grid, 'aPos', geo.gridPos, 3);
    gl.drawArrays(gl.LINES, 0, geo.gridN);

    /* dot shell */
    useProg(gl, P.dots);
    gl.uniformMatrix4fv(P.dots.u.uMVP, false, mMVP);
    gl.uniformMatrix4fv(P.dots.u.uModel, false, mModel);
    gl.uniform3fv(P.dots.u.uCam, camPos);
    gl.uniform1f(P.dots.u.uTime, t);
    gl.uniform1f(P.dots.u.uReveal, S.reveal);
    /* A world-space radius projected to pixels. gl_PointSize divides by the
       clip w, so the base has to carry the focal term: (h/2) / tan(fov/2).
       Getting this wrong by the camera distance is how you end up with a
       sub-pixel dot shell that looks like nothing rendered at all. */
    gl.uniform1f(P.dots.u.uPx, DOT_R * (G.h * 0.5) / Math.tan(rad(38) / 2));
    attrib(gl, P.dots, 'aPos', geo.dotPos, 3);
    attrib(gl, P.dots, 'aHeat', geo.dotHeat, 1);
    gl.drawArrays(gl.POINTS, 0, geo.dotN);

    /* arcs */
    if (sc.arc) {
      useProg(gl, P.arc);
      gl.uniformMatrix4fv(P.arc.u.uMVP, false, mMVP);
      gl.uniform1f(P.arc.u.uAspect, G.w / Math.max(1, G.h));
      gl.uniform1f(P.arc.u.uTime, t);
      attrib(gl, P.arc, 'aPos', sc.arc.pos, 3);
      attrib(gl, P.arc, 'aTan', sc.arc.tan, 3);
      attrib(gl, P.arc, 'aSide', sc.arc.side, 1);
      attrib(gl, P.arc, 'aT', sc.arc.t, 1);
      attrib(gl, P.arc, 'aW', sc.arc.w, 1);
      attrib(gl, P.arc, 'aCol', sc.arc.col, 3);
      var off = 0;
      for (var i = 0; i < sc.arc.strips.length; i++) {
        gl.drawArrays(gl.TRIANGLE_STRIP, off, sc.arc.strips[i]);
        off += sc.arc.strips[i];
      }
    }

    /* pins */
    if (sc.pin) {
      useProg(gl, P.pin);
      gl.uniformMatrix4fv(P.pin.u.uMVP, false, mMVP);
      gl.uniformMatrix4fv(P.pin.u.uModel, false, mModel);
      gl.uniformMatrix4fv(P.pin.u.uView, false, mView);
      gl.uniform3fv(P.pin.u.uCam, camPos);
      gl.uniform1f(P.pin.u.uTime, t);
      gl.uniform1f(P.pin.u.uSel, S.sel);
      attrib(gl, P.pin, 'aPos', sc.pin.pos, 3);
      attrib(gl, P.pin, 'aCorner', sc.pin.corner, 2);
      attrib(gl, P.pin, 'aScale', sc.pin.scale, 1);
      attrib(gl, P.pin, 'aCol', sc.pin.col, 3);
      attrib(gl, P.pin, 'aKind', sc.pin.kind, 1);
      attrib(gl, P.pin, 'aIdx', sc.pin.idx, 1);
      gl.drawArrays(gl.TRIANGLES, 0, sc.pin.n);
    }

    /* atmosphere last, inside-out */
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT);
    useProg(gl, P.atmo);
    m4scale(mTmp, 1.17); m4mul(mTmp, mModel, mTmp);
    gl.uniformMatrix4fv(P.atmo.u.uMVP, false, m4mul(m4(), mVP, mTmp));
    gl.uniformMatrix4fv(P.atmo.u.uModel, false, mTmp);
    gl.uniform3fv(P.atmo.u.uCam, camPos);
    attrib(gl, P.atmo, 'aPos', geo.sphPos, 3);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geo.sphIdx);
    gl.drawElements(gl.TRIANGLES, geo.sphN, gl.UNSIGNED_SHORT, 0);
    gl.disable(gl.CULL_FACE);
    gl.depthMask(true);

    positionPins();
  }

  /* Project the pins to CSS pixels so the tooltip and hit-testing agree with
     what is on screen. */
  function positionPins() {
    if (!V.stage || !G.scene) return;
    var out = [0, 0, 0, 0], w = G.w / G.dpr, h = G.h / G.dpr;
    V.screen = G.scene.list.map(function (s) {
      xform(out, mMVP, s.v[0], s.v[1], s.v[2]);
      var facing = (s.v[0] * camPos[0] + s.v[1] * camPos[1] + s.v[2] * camPos[2]) > 0.12;
      return { s: s, x: (out[0] * 0.5 + 0.5) * w, y: (1 - (out[1] * 0.5 + 0.5)) * h, on: facing && out[3] > 0 };
    });
  }

  /* -------------------------------------------------------------------------
   * 12. DOM OVERLAY
   * ---------------------------------------------------------------------- */
  var MARK = '<svg viewBox="0 0 44 44" aria-hidden="true">' +
    '<circle cx="22" cy="22" r="20" fill="none" stroke="rgba(34,211,238,.30)" stroke-width="1"/>' +
    '<circle cx="22" cy="22" r="14" fill="none" stroke="rgba(34,211,238,.55)" stroke-width="1"/>' +
    '<path d="M9 29 L18 15 L24 24 L29 17 L35 29 Z" fill="rgba(52,211,153,.85)"/>' +
    '<circle cx="22" cy="22" r="20" fill="none" stroke="#22d3ee" stroke-width="1.6" ' +
    'stroke-dasharray="10 116" stroke-linecap="round">' +
    '<animateTransform attributeName="transform" type="rotate" from="0 22 22" to="360 22 22" ' +
    'dur="7s" repeatCount="indefinite"/></circle></svg>';

  var ICONS = {
    statement: '<path d="M4 2h9l4 4v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M13 2v4h4"/><path d="M6 9h7M6 12h7M6 15h4"/>',
    pareto: '<path d="M3 16V9M7.5 16V6M12 16v-5M16.5 16V3"/><path d="M2 17h16"/>',
    globe: '<circle cx="10" cy="10" r="7.5"/><path d="M2.5 10h15M10 2.5c2 2.4 3 4.9 3 7.5s-1 5.1-3 7.5c-2-2.4-3-4.9-3-7.5s1-5.1 3-7.5z"/>',
    grid: '<rect x="2.5" y="2.5" width="6" height="6" rx="1"/><rect x="11.5" y="2.5" width="6" height="6" rx="1"/><rect x="2.5" y="11.5" width="6" height="6" rx="1"/><rect x="11.5" y="11.5" width="6" height="6" rx="1"/>'
  };

  function svgIcon(k) {
    return '<svg viewBox="0 0 20 20" aria-hidden="true">' + ICONS[k] + '</svg>';
  }

  function buildTop(d) {
    var n = el('div', NS + '-top');
    var brand = el('div', NS + '-brand');
    brand.appendChild(el('div', NS + '-mark', MARK));
    var bt = el('div', NS + '-bt');
    bt.appendChild(el('h1', null, esc(d.meta.title || 'TrailPeak Outfitters')));
    bt.appendChild(el('p', null, esc(d.meta.company || 'FINANCE · MONTHLY REPORTING')));
    brand.appendChild(bt);
    n.appendChild(brand);
    n.appendChild(el('div', NS + '-spacer'));
    var st = el('div', NS + '-stat');
    st.appendChild(el('span', NS + '-dot'));
    st.appendChild(el('span', null, 'Model live'));
    n.appendChild(st);
    n.appendChild(el('div', NS + '-thru',
      'Data through <b>' + esc(String(d.meta.dataThrough || '').replace(/^Data through\s*/i, '')) + '</b>'));
    return n;
  }

  /* A tiny sparkline. SVG, because 30 points do not need a canvas. */
  function sparkPath(vals, w, h, pad) {
    if (!vals.length) return '';
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    var rng = (mx - mn) || 1, p = pad == null ? 2 : pad, dd = '';
    for (var i = 0; i < vals.length; i++) {
      var x = p + (i / (vals.length - 1 || 1)) * (w - p * 2);
      var y = h - p - ((vals[i] - mn) / rng) * (h - p * 2);
      dd += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    return dd;
  }

  function kpiRow(label, value, unit, delta, deltaLabel, spark, sparkCol) {
    var n = el('div', NS + '-kpi');
    n.appendChild(el('div', NS + '-kl', esc(label)));
    var v = el('div', NS + '-kv');
    v.appendChild(document.createTextNode(value));
    if (unit) v.appendChild(el('small', null, esc(unit)));
    n.appendChild(v);
    if (delta != null) {
      var cls = delta > 0 ? NS + '-up' : (delta < 0 ? NS + '-dn' : NS + '-nu');
      var arrow = delta > 0 ? '▲' : (delta < 0 ? '▼' : '▬');
      n.appendChild(el('div', NS + '-kd ' + cls,
        '<b>' + arrow + ' ' + esc(deltaLabel) + '</b><span style="color:#6d84a3">vs budget</span>'));
    }
    if (spark && spark.length > 1) {
      var w = 96, h = 34;
      n.appendChild(el('div', NS + '-spark',
        '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' +
        '<path d="' + sparkPath(spark, w, h, 3) + '" fill="none" stroke="' + sparkCol +
        '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" opacity=".9"/></svg>'));
    }
    return n;
  }

  function buildKpis(d) {
    var n = el('div', NS + '-p ' + NS + '-kpis');
    n.appendChild(el('div', NS + '-h', '<i></i>Company performance'));
    var k = d.kpi, tr = d.trend;
    var revs = tr.map(function (r) { return r.rev; });
    var ops  = tr.map(function (r) { return r.op; });
    n.appendChild(kpiRow('Total revenue', money(k.rev, 1), null, null, null, revs, '#22d3ee'));
    n.appendChild(kpiRow('Gross margin', pct(k.gmBp), null, null, null,
      tr.map(function (r) { return r.rev ? r.gp / r.rev : 0; }), '#34d399'));
    n.appendChild(kpiRow('EBITDA', money(k.ebitda, 2), null, null, null, null, null));
    n.appendChild(kpiRow('Operating profit', money(k.op, 2), null,
      isNum(k.varc) ? k.varc : null, signed(k.varc), ops, '#fbbf24'));
    return n;
  }

  function buildRegions(d) {
    var n = el('div', NS + '-p ' + NS + '-reg');
    n.appendChild(el('div', NS + '-h', '<i></i>Revenue by region'));
    var max = d.regions.reduce(function (m, r) { return Math.max(m, r.rev || 0); }, 1);
    d.regions.slice().sort(function (a, b) { return b.rev - a.rev; }).forEach(function (r) {
      var row = el('div', NS + '-rrow' + (S.region === r.name ? ' is-on' : ''));
      row.setAttribute('data-region', r.name);
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.setAttribute('aria-pressed', S.region === r.name ? 'true' : 'false');
      var sw = el('i', NS + '-rsw');
      sw.style.background = REGION_HEX[r.name] || '#22d3ee';
      sw.style.boxShadow = '0 0 10px ' + (REGION_HEX[r.name] || '#22d3ee');
      row.appendChild(sw);
      var mid = el('div');
      mid.appendChild(el('div', NS + '-rn', esc(r.name)));
      var bar = el('div', NS + '-rb');
      var fill = el('span');
      fill.style.width = ((r.rev / max) * 100).toFixed(1) + '%';
      fill.style.background = REGION_HEX[r.name] || '#22d3ee';
      bar.appendChild(fill); mid.appendChild(bar);
      row.appendChild(mid);
      var right = el('div');
      right.appendChild(el('div', NS + '-rv', money(r.rev, 1)));
      right.appendChild(el('span', NS + '-rs', r.n + ' stores · ' + pct(r.gmBp) + ' GM'));
      row.appendChild(right);
      n.appendChild(row);
    });
    return n;
  }

  function buildStorePanel(d) {
    var n = el('div', NS + '-p ' + NS + '-store');
    n.appendChild(el('div', NS + '-h', '<i></i>Store detail'));
    var s = S.sel >= 0 ? d.stores[S.sel] : null;
    if (!s) {
      n.appendChild(el('div', NS + '-sempty',
        '<b>Select a store</b>Click any glowing marker on the globe. Twelve stores across four ' +
        'regions, positioned at their real coordinates and sized by revenue.'));
      var g0 = el('div', NS + '-sgrid');
      [['Stores', intFmt(d.kpi.nStores)], ['Regions', intFmt(d.kpi.nRegions)],
       ['SKUs', intFmt(d.kpi.nProducts)], ['Closed months', intFmt(d.kpi.nMonths)]].forEach(function (p) {
        var c = el('div', NS + '-sc');
        c.appendChild(el('div', NS + '-scl', p[0]));
        c.appendChild(el('div', NS + '-scv', p[1]));
        g0.appendChild(c);
      });
      n.appendChild(g0);
      return n;
    }
    n.appendChild(el('div', NS + '-sname', esc(s.name)));
    n.appendChild(el('div', NS + '-smeta',
      esc(s.city + ', ' + s.state) + '  ·  ' + esc(s.region) + '  ·  ' + esc(s.tier) +
      '  ·  ' + esc(s.code)));
    var g = el('div', NS + '-sgrid');
    [['Revenue', money(s.rev, 2)], ['Gross margin', pct(s.gmBp)],
     ['Operating profit', money(s.op, 2)], ['Variance vs budget', signed(s.varc)],
     ['Units sold', intFmt(s.units)], ['Sales floor', intFmt(s.sqft) + ' sq ft']].forEach(function (p, i) {
      var c = el('div', NS + '-sc');
      c.appendChild(el('div', NS + '-scl', p[0]));
      var vv = el('div', NS + '-scv', p[1]);
      if (i === 3 && isNum(s.varc)) vv.style.color = s.varc >= 0 ? '#34d399' : '#f87171';
      c.appendChild(vv);
      g.appendChild(c);
    });
    n.appendChild(g);
    return n;
  }

  function buildProducts(d) {
    var n = el('div', NS + '-p ' + NS + '-prod');
    n.appendChild(el('div', NS + '-h', '<i></i>Top products by revenue'));
    d.products.slice(0, 6).forEach(function (p, i) {
      var row = el('div', NS + '-prow');
      row.appendChild(el('div', NS + '-pi', String(i + 1).padStart(2, '0')));
      var mid = el('div');
      mid.appendChild(el('div', NS + '-pn', esc(p.name)));
      mid.appendChild(el('span', NS + '-pc', esc(p.cat) + ' · ' + esc(p.sku)));
      row.appendChild(mid);
      row.appendChild(el('div', NS + '-pv', money(p.rev, 2)));
      n.appendChild(row);
    });
    return n;
  }

  function buildRibbon(d) {
    var n = el('div', NS + '-p ' + NS + '-rib');
    var head = el('div', NS + '-ribh');
    head.appendChild(el('h3', null, 'Monthly revenue and operating profit · ' + d.trend.length + ' closed months'));
    head.appendChild(el('div', NS + '-lg',
      '<span><i style="background:#22d3ee"></i>Revenue</span>' +
      '<span><i style="background:#fbbf24"></i>Operating profit</span>' +
      '<span><i style="background:rgba(148,163,184,.7)"></i>Budget</span>'));
    n.appendChild(head);

    var W = 1740, H = 98, PAD = 8;
    var tr = d.trend;
    if (!tr.length) { n.appendChild(el('div', NS + '-sempty', 'No closed months in filter context.')); return n; }
    var revs = tr.map(function (r) { return r.rev; });
    var ops = tr.map(function (r) { return r.op; });
    var bud = tr.map(function (r) { return isNum(r.budget) ? r.budget : 0; });
    var rMax = Math.max.apply(null, revs) * 1.06;
    var oAll = ops.concat(bud);
    var oMin = Math.min.apply(null, oAll), oMax = Math.max.apply(null, oAll);
    var oRng = (oMax - oMin) || 1;

    function xAt(i) { return PAD + (i / (tr.length - 1 || 1)) * (W - PAD * 2); }
    function yRev(v) { return H - PAD - (v / rMax) * (H - PAD * 2) * 0.94; }
    function yOp(v) { return H - PAD - ((v - oMin) / oRng) * (H - PAD * 2) * 0.90; }

    var area = '', line = '', opl = '', bdl = '';
    tr.forEach(function (r, i) {
      var x = xAt(i).toFixed(1);
      line += (i ? 'L' : 'M') + x + ' ' + yRev(r.rev).toFixed(1);
      opl  += (i ? 'L' : 'M') + x + ' ' + yOp(r.op).toFixed(1);
      bdl  += (i ? 'L' : 'M') + x + ' ' + yOp(isNum(r.budget) ? r.budget : 0).toFixed(1);
    });
    area = line + 'L' + xAt(tr.length - 1).toFixed(1) + ' ' + (H - PAD) + 'L' + xAt(0).toFixed(1) + ' ' + (H - PAD) + 'Z';

    var ticks = '';
    tr.forEach(function (r, i) {
      if (i % 6 !== 0 && i !== tr.length - 1) return;
      ticks += '<text x="' + xAt(i).toFixed(1) + '" y="' + (H - 1) + '" fill="#5d738f" font-size="9" ' +
               'font-family="Segoe UI,sans-serif" text-anchor="' +
               (i === 0 ? 'start' : (i === tr.length - 1 ? 'end' : 'middle')) + '">' + esc(r.label) + '</text>';
    });

    n.appendChild(el('div', null,
      '<svg class="' + NS + '-ribsvg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" ' +
      'role="img" aria-label="Monthly revenue and operating profit against budget">' +
      '<defs><linearGradient id="' + NS + 'g" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#22d3ee" stop-opacity=".34"/>' +
      '<stop offset="100%" stop-color="#22d3ee" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + area + '" fill="url(#' + NS + 'g)"/>' +
      '<path d="' + line + '" fill="none" stroke="#22d3ee" stroke-width="1.8" ' +
      'stroke-linejoin="round" stroke-linecap="round"/>' +
      '<path d="' + bdl + '" fill="none" stroke="rgba(148,163,184,.62)" stroke-width="1.3" ' +
      'stroke-dasharray="4 4" stroke-linejoin="round"/>' +
      '<path d="' + opl + '" fill="none" stroke="#fbbf24" stroke-width="1.7" ' +
      'stroke-linejoin="round" stroke-linecap="round"/>' +
      ticks + '</svg>'));
    return n;
  }

  var TILES = [
    ['statement', 'P&L statement', 'Actual, budget, variance by line', 'pnl'],
    ['pareto', 'Product Pareto', 'The vital few across 120 SKUs', 'pareto'],
    ['globe', 'Store network', 'Twelve stores, four regions', 'stores'],
    ['grid', 'Full report page', 'Everything, one visual', 'page']
  ];

  function buildNav() {
    var n = el('div', NS + '-nav');
    TILES.forEach(function (t) {
      var b = el('button', NS + '-t');
      b.type = 'button';
      b.setAttribute('data-nav', t[3]);
      b.appendChild(el('div', NS + '-ti', svgIcon(t[0])));
      var tx = el('div');
      tx.appendChild(el('div', NS + '-tt', esc(t[1])));
      tx.appendChild(el('div', NS + '-ts', esc(t[2])));
      b.appendChild(tx);
      n.appendChild(b);
    });
    return n;
  }

  /* -------------------------------------------------------------------------
   * 13. RENDER
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
    if (!c) {
      c = document.createElement('div');
      c.id = 'tph-root';
      (document.body || document.documentElement).appendChild(c);
    }
    return c;
  }

  function fitStage() {
    if (!V.stage || !V.root) return;
    var r = V.root.getBoundingClientRect();
    var s = Math.min(r.width / 1920, r.height / 1080);
    V.stage.style.transform = 'translate(' + ((r.width - 1920 * s) / 2).toFixed(2) + 'px,' +
      ((r.height - 1080 * s) / 2).toFixed(2) + 'px) scale(' + s.toFixed(5) + ')';
    V.scale = s;
    V.offX = (r.width - 1920 * s) / 2;
    V.offY = (r.height - 1080 * s) / 2;
  }

  function render() {
    var root = ensureRoot();
    ensureStyles();
    V = {};
    root.className = NS;
    root.innerHTML = '';

    var raw = window.__tpHome;
    if (!raw || !raw.stores) {
      root.appendChild(el('div', NS + '-fail',
        '<div><b>Waiting for data</b><p>window.__tpHome was not set. The measure emits the payload ' +
        'immediately before this file loads, so this usually means the measure returned blank.</p></div>'));
      return;
    }
    if (!D || D.__raw !== raw) { D = decode(raw); D.__raw = raw; rebuildPending = true; }

    /* the persistent canvas is re-adopted, never recreated */
    var canvas = ensureCanvas();
    ensureGL();
    root.appendChild(canvas);
    root.appendChild(el('div', NS + '-vig'));
    root.appendChild(el('div', NS + '-scan'));

    var stage = el('div', NS + '-stage');
    stage.appendChild(buildTop(D));
    stage.appendChild(buildKpis(D));
    stage.appendChild(buildRegions(D));
    stage.appendChild(buildStorePanel(D));
    stage.appendChild(buildProducts(D));
    stage.appendChild(buildRibbon(D));
    stage.appendChild(buildNav());
    stage.appendChild(el('div', NS + '-hint', 'Drag to rotate · scroll to zoom · click a marker'));
    root.appendChild(stage);

    var tip = el('div', NS + '-tip');
    tip.innerHTML = '<div class="' + NS + '-tipn"></div><div class="' + NS + '-tipr"></div>' +
                    '<div class="' + NS + '-tipv"></div>';
    root.appendChild(tip);
    root.appendChild(el('div', NS + '-build',
      'trailpeak-home v' + VERSION + ' · webgl2 · ' + (D.meta.build || 'dev')));

    V.root = root; V.stage = stage; V.tip = tip; V.canvas = canvas;
    fitStage();

    if (rebuildPending) { try { rebuild(); } catch (e) { fail(e); return; } rebuildPending = false; }

    /* Wire ONCE per root element. render() empties and refills the root but
       does not replace the element, so wiring every time stacks handlers and a
       toggle would fire twice and net to nothing. */
    if (root.__tphWired !== VERSION) { wire(root); root.__tphWired = VERSION; }
    if (canvas.__tphWired !== VERSION) { wireCanvas(canvas); canvas.__tphWired = VERSION; }

    startLoop();
  }

  var rebuildPending = true;

  function startLoop() {
    if (G.raf) cancelAnimationFrame(G.raf);
    if (!S.t0) S.t0 = performance.now();
    G.raf = requestAnimationFrame(draw);
  }

  /* -------------------------------------------------------------------------
   * 14. INTERACTION
   * ---------------------------------------------------------------------- */
  function closest(n, sel) {
    while (n && n !== document) {
      if (n.nodeType === 1 && n.matches && n.matches(sel)) return n;
      n = n.parentNode;
    }
    return null;
  }

  function pickPin(cx, cy) {
    if (!V.screen) return -1;
    var best = -1, bd = 26;
    for (var i = 0; i < V.screen.length; i++) {
      var p = V.screen[i];
      if (!p.on) continue;
      var d = Math.hypot(p.x - cx, p.y - cy);
      if (d < bd) { bd = d; best = p.s.i; }
    }
    return best;
  }

  /* Auto-spin lets az grow without bound, so a target in [-pi,pi] can be many
     turns away. Bring it to the nearest equivalent angle or the globe unwinds
     the long way round. */
  function nearestAngle(from, to) {
    var d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return from + d;
  }

  function focusStore(i) {
    S.sel = i;
    if (i >= 0 && D && D.stores[i]) {
      var s = D.stores[i];
      S.tAz = nearestAngle(S.az, -rad(s.lon));
      S.tEl = clamp(rad(s.lat), -1.2, 1.2);
      S.tDist = 4.2;
      S.spin = false;
    }
    render();
  }

  function wireCanvas(c) {
    var px = 0, py = 0, moved = 0;

    c.addEventListener('pointerdown', function (e) {
      S.drag = true; moved = 0; px = e.clientX; py = e.clientY;
      c.classList.add('is-drag');
      try { c.setPointerCapture(e.pointerId); } catch (x) {}
    });

    c.addEventListener('pointermove', function (e) {
      var r = c.getBoundingClientRect();
      if (S.drag) {
        var dx = e.clientX - px, dy = e.clientY - py;
        moved += Math.abs(dx) + Math.abs(dy);
        S.tAz += dx * 0.0062;
        S.tEl = clamp(S.tEl - dy * 0.0052, -1.32, 1.32);
        px = e.clientX; py = e.clientY;
        return;
      }
      var i = pickPin(e.clientX - r.left, e.clientY - r.top);
      var p = i >= 0 ? V.screen.filter(function (q) { return q.s.i === i; })[0] : null;
      if (p && V.tip) {
        var s = p.s;
        V.tip.querySelector('.' + NS + '-tipn').textContent = s.name;
        var rr = V.tip.querySelector('.' + NS + '-tipr');
        rr.textContent = s.region + ' · ' + s.tier;
        rr.style.color = REGION_HEX[s.region] || '#8ea4c2';
        V.tip.querySelector('.' + NS + '-tipv').textContent =
          money(s.rev, 2) + '  ·  ' + pct(s.gmBp) + ' GM';
        V.tip.style.left = p.x + 'px';
        V.tip.style.top = p.y + 'px';
        V.tip.classList.add('is-on');
        c.style.cursor = 'pointer';
      } else if (V.tip) {
        V.tip.classList.remove('is-on');
        c.style.cursor = '';
      }
    });

    function up(e) {
      if (!S.drag) return;
      S.drag = false;
      c.classList.remove('is-drag');
      try { c.releasePointerCapture(e.pointerId); } catch (x) {}
      if (moved < 5) {
        var r = c.getBoundingClientRect();
        var i = pickPin(e.clientX - r.left, e.clientY - r.top);
        if (i >= 0) focusStore(i);
        else if (S.sel >= 0) { S.sel = -1; S.spin = true; render(); }
      }
    }
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', function () { S.drag = false; c.classList.remove('is-drag'); });
    c.addEventListener('mouseleave', function () { if (V.tip) V.tip.classList.remove('is-on'); });

    c.addEventListener('wheel', function (e) {
      e.preventDefault();
      S.tDist = clamp(S.tDist + (e.deltaY > 0 ? 0.42 : -0.42), 3.4, 12.0);
    }, { passive: false });

    c.addEventListener('dblclick', function () {
      S.sel = -1;
      S.tAz = nearestAngle(S.az, HOME_VIEW.az);
      S.tEl = HOME_VIEW.el;
      S.tDist = HOME_VIEW.dist;
      S.spin = true;
      render();
    });
  }

  function wire(root) {
    root.addEventListener('click', function (e) {
      var r = closest(e.target, '[data-region]');
      if (r) {
        var name = r.getAttribute('data-region');
        S.region = (S.region === name) ? null : name;
        S.sel = -1;
        rebuildPending = true;
        render();
        return;
      }
      var nav = closest(e.target, '[data-nav]');
      if (nav) {
        var key = nav.getAttribute('data-nav');
        if (key === 'stores') { S.region = null; S.sel = -1; S.spin = true; S.tDist = 3.0; rebuildPending = true; render(); }
        else flash(nav);
        return;
      }
    });

    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var r = closest(e.target, '[data-region]');
      if (r) { e.preventDefault(); r.click(); }
    });

    if (typeof ResizeObserver === 'function') {
      if (V.ro) V.ro.disconnect();
      var ro = new ResizeObserver(function () { fitStage(); });
      ro.observe(root);
      V.ro = ro;
    } else {
      window.addEventListener('resize', fitStage);
    }
  }

  /* Page navigation cannot be driven from inside the visual: the iframe has no
     handle on IVisualHost. Say so honestly rather than doing nothing. */
  function flash(node) {
    var old = node.querySelector('.' + NS + '-ts');
    if (!old || node.__flash) return;
    node.__flash = true;
    var was = old.textContent;
    old.textContent = 'Use the page tabs. A visual cannot navigate.';
    old.style.color = '#fbbf24';
    setTimeout(function () {
      old.textContent = was; old.style.color = ''; node.__flash = false;
    }, 2600);
  }

  /* -------------------------------------------------------------------------
   * 15. BOOT
   * ---------------------------------------------------------------------- */
  var pending = false, tries = 0, timer = null, rendered = false;

  function schedule() {
    if (pending) return;
    pending = true;
    var run = function () {
      pending = false;
      try { render(); rendered = true; } catch (e) { fail(e); }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  function boot() {
    if (timer) clearTimeout(timer);
    tries = 0;
    attempt();
  }

  function attempt() {
    if (!document.body) { if (tries++ < 200) timer = setTimeout(attempt, 16); return; }
    if (!window.__tpHome && !rendered && tries < 12 && document.readyState !== 'complete') {
      tries++; timer = setTimeout(attempt, 24); return;
    }
    schedule();
  }

  function fail(e) {
    if (G.raf) { cancelAnimationFrame(G.raf); G.raf = 0; }
    try {
      var msg = (e && e.message) ? e.message : String(e);
      ensureStyles();
      var root = ensureRoot();
      root.className = NS;
      root.innerHTML = '';
      root.appendChild(el('div', NS + '-fail',
        '<div><b>The home page failed to render.</b>' +
        '<p>The scene is hand-written WebGL2. If this tenant or browser blocks it, or the ' +
        'context could not be created, nothing else on the page can recover it.</p>' +
        '<code>v' + VERSION + ' · ' + esc(msg) + '</code></div>'));
      if (window.console && console.error) console.error('[tph]', e);
    } catch (x) { /* nothing left to do */ }
  }

  window.TPH = {
    __installed: VERSION,
    version: VERSION,
    boot: boot,
    render: schedule,
    state: S,
    _dbg: function () { return { D: D, G: G, V: V }; }
  };

  boot();
})();
