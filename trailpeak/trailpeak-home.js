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
    /* Baked by bake.mjs from world-atlas@2.0.2 countries-110m, projected with
     d3.geoAlbersUsa().fitExtent([[26,26],[974,590]]). viewBox 0 0 1000 620.
     Regenerate rather than hand-edit. */
  var US_VIEWBOX = '0 0 1000 620';
  var US_LAND = 'M127.6,26L167.1,36.8L208.8,46.9L222.6,49.9L265.8,58.4L307.8,65.4L350.7,71.1L393.8,75.4L442.7,78.7L492.1,80.2L521.9,80.3L521.9,72L526.8,71.9L529.5,83.6L534,87.2L544.2,88.3L559.1,91.3L573.5,97.3L585.2,93.9L603.5,98.5L608.3,97.9L620.8,90.8L635.2,97.5L650.3,104.4L663,110.3L675.2,115.9L677.3,121.4L681.1,123L680.4,125.3L684.5,125.5L687.1,122.9L688.5,127.9L692,130.9L696.1,130.4L698.6,132.7L697.2,136.8L714.3,144.7L720.4,163.8L726.2,182.1L723.5,195.5L717.8,208.5L715.4,216.6L715.3,218.9L717.5,221.7L723.4,224.4L727.4,223.8L744.1,209.5L759.8,203.5L778.4,189.2L778.3,187L775.7,180.6L772.5,176.9L778.8,172.2L793.9,169.3L808,166.5L811.2,157.1L812.7,155.1L825.4,136.3L831.3,130.9L853.9,125.4L881.3,118.5L881.5,112.9L885.9,110.6L891.3,105.6L893.9,94.7L893.7,77.2L900.2,58.4L906.5,62.5L915,56.1L923.1,60.2L931.7,88.4L944.9,97.2L949.5,103.2L936.9,118.2L923.7,129.9L909.7,140.7L905.1,155.4L903.8,160.8L906.7,172.1L914.9,181.8L921.4,180.6L917.7,173.3L923.6,176.7L924.1,183.1L914.5,189.4L906.9,191.1L896.3,197.8L889.8,200.6L880.9,203.9L869.3,213.3L891.4,203.6L897.1,206.4L876.6,218.3L866.5,220.8L866.3,218.1L862.9,225.1L867.8,225L867.9,241.1L859.9,260.3L857.5,255.1L853.6,254.8L847.1,250.6L853,261.4L857.9,264.3L860,272.3L856.6,281.8L850.9,301L849.2,300.4L851.2,284.7L841,278.4L835.3,260.9L834.1,270.9L840.5,283.8L828.9,282.6L841.7,287.2L846.7,307.5L851.8,308L855.2,315L862.2,335.9L854.7,354.2L838,364.2L829,379L820.4,382L812.9,391.6L811.7,399.3L794.5,416.6L786,428.5L779.4,442.7L778.9,458.4L784.6,472.9L793.7,490.2L804.5,504L806.1,513.3L819.3,536.5L821.1,550.9L821.7,559.3L819,573.1L813.5,576.7L803.4,575.7L798.9,566.9L790.7,563.1L777.7,546.3L766.4,531.3L762.3,523.3L764.2,508.5L757.3,497.4L740.3,481.3L732.6,479L714.9,491.1L711.5,490.3L701.3,481.3L689,477.1L668.2,481.9L651.4,480.9L637.3,483.5L629.9,487.4L633.6,492.9L633.9,501.7L638.2,505.7L634.8,508.8L627.6,506.1L620.8,510.7L606.9,510.8L592.3,500L575.9,503.4L562.1,498.8L550.4,500.7L534.6,506L517.4,522.3L498.4,531.6L487.8,541.9L483.3,551.5L482.8,566.4L483.7,576.8L487.3,584.1L479.6,584.7L465.7,579.7L450.5,572.5L445.4,562.3L441.7,547L430.8,534.2L424.7,521.2L416,505.9L403.1,496.5L387.7,495.9L374.6,512.2L359.5,504.5L350.2,497.1L346.7,484.8L341.6,472.9L331.5,462.3L322.8,454.4L316.9,446L285.3,442.2L284.1,451.1L269.6,449.2L233.2,443.9L194.4,421.7L169.3,406.1L171.9,402.2L148.8,399.8L128.2,397L127.7,385.5L119.2,370.6L111.6,366.1L111.2,359.6L101.7,356.1L96.9,348.8L81.5,342.6L78,338L79,325.9L68.4,300.2L62.9,266.9L64.9,262.2L59.7,253.2L52.4,231.9L55.4,214.1L50.5,200L59.2,183.8L64.2,165.6L64.2,148.1L76.2,130.2L83.7,111.9L91.2,93.5L97,64.9L98,45.9L96.9,35.1L99.8,31.6L117.9,44.7L119.8,66.4L124.9,62L127.5,44.3ZM338.8,564.8L342.4,566.6L345.8,569.5L351.1,577L350.6,578.2L342.6,582.9L336.1,586.4L333,590L327.9,586.9L328.5,580.9L325,573L326.1,570.6L329.6,567L328.2,562.8L329.4,560.8L330.9,561.2ZM326.6,550L324.9,552.6L318,554.2L314.5,549.6L312.2,547.9L311.9,546.5L313.9,544.7L321.2,546.7ZM311,541.2L310.3,543.5L299.4,542.9L300.9,540.2ZM285.2,529.5L286.9,530.8L292.7,538L291.6,539.3L290.2,539L283.1,538.2L280.6,533.3L279.8,532.4ZM258,518.6L258.4,523.6L255.9,525.7L249.2,521.7L250.2,520.2L253.4,518.1ZM79.1,536.1L81.9,537.3L81.8,540.2L79.3,541L77.1,539.1L75.2,536.6ZM128.6,558.9L131.3,559.3L133.1,561.7L129.6,565.4L125.5,568.3L123.4,566.3L122.8,562.7L126.5,560ZM160.1,466.3L165.6,493.7L174,536.3L177.7,535.8L181.7,537L185.1,539.7L189.6,543.7L192.2,538.6L195.2,535.2L198.3,538.4L201.7,540.7L206.2,542.9L210.2,547.3L217,554.2L225.4,556.3L227.2,560.7L226.3,565L223,563.1L218.6,562.1L215.3,556.2L208.3,552L204.1,545.8L200.3,546.5L194.1,548L189,547L179.4,541.2L175.5,540.5L168.5,539L163.4,540.5L155.6,538.1L150.9,535.3L146.9,537.3L148.2,542.5L146.1,543.2L141.8,545.1L138.6,547.9L134.4,549.7L133.7,545.2L135.1,537.7L138.9,535.1L137.8,533.3L133.3,537.7L130.9,542.9L125.5,548.3L128.3,552L124.6,557.5L120.2,560.7L116.1,562.9L115,566.2L108.3,569.8L106.7,573.3L101.5,576.2L98.6,575.3L94.4,577L89.7,579.1L85.8,581.1L78,582.1L77.5,580.8L82.8,578L87.3,576.3L92.4,572.7L97.7,572.5L100.1,569.5L106.2,565.5L107.2,564L110.4,561.5L111.4,555.8L113.6,551.4L109,553.4L107.8,552L105.5,554.6L103.2,550.6L101.9,553.2L100.8,549.3L96.6,551.9L94.2,551.6L94.4,547.1L95.4,544.4L93.3,541.4L88.2,542.2L85.6,538.1L83.4,535.9L84.1,531.6L81.9,527.9L84.1,523.9L87.6,520.2L89.5,516.5L92.3,516.4L94.5,517.9L97.7,514.6L100,515.6L102.8,513.5L102.6,510L100.9,508.4L103.6,505.8L101.6,505.6L98,506.9L96.8,508.4L94.5,506.4L89.8,506.5L85.4,503.9L84.6,500.6L81.6,495.5L86.5,493.3L93.9,490.8L96.4,491.2L95.4,494.9L101.9,495.4L100,490.5L96.7,487.1L95.2,483L93,479.4L89.6,476.4L91.9,472.8L96.8,473.4L100.7,470.5L101.8,467L104.9,463.8L107.6,463.2L112.7,460.4L115,461L119.1,457.3L122.8,458.9L124.6,462.3L125.8,460.9L130.1,461.3L130,463L134,464.1L136.6,463.2L142.2,465.1L147.3,465.3L149.5,466L152.8,464.2L157.1,465.8ZM66.8,506.6L68.4,508.6L70.6,508.3L72.8,511L75.9,512.7L75.4,513.5L72.5,514.4L70.4,512.2L69.4,510.6L66.4,510.2L65.8,509.4Z';
  var US_GRAT = 'M0.1,595.8L51.3,471.6L58.6,453.9M26.1,595.8L65.1,476.7L72.5,453.9M50.9,595.8L79.1,480.7L85.7,453.9M74.7,595.8L93.5,483.6L98.4,453.9M98,595.8L108,485.5L110.8,453.9M244.2,595.8L245.2,512.3L245.2,511.1M120.9,595.8L122.6,486.3L123.1,453.9M347.3,595.8L346.6,512.5L346.6,511.1M143.8,595.8L137.2,486L135.3,453.9M167,595.8L151.8,484.5L147.6,453.9M190.6,595.8L166.2,482L160.2,453.9M-66.6,33.7L-55.5,8.3M214.9,595.8L180.4,478.4L173.2,453.9M-66.6,250.7L-0.7,74.5L24,8.3M233.4,577.2L194.3,473.8L186.8,453.9M-66.6,538.8L71.8,99.4L100.5,8.3M233.4,522.9L207.8,468.1L201.1,453.9M21.6,600.8L23.2,594.6L145.5,120.6L174.5,8.3M233.4,483.8L220.8,461.4L216.6,453.9M126.4,600.8L220.3,137.8L246.5,8.3M229.1,600.8L295.8,151L317,8.3M330.1,600.8L371.9,160.3L386.4,8.3M430.1,600.8L448.4,165.5L455.1,8.3M529.7,600.8L525.1,166.7L523.5,8.3M629.4,600.8L601.8,163.9L591.9,8.3M729.7,600.8L678.2,157L660.9,8.3M831.3,600.8L754.1,146.2L730.6,8.3M934.8,600.8L829.3,131.3L801.7,8.3M1040.7,600.8L1035.9,584L903.7,112.6L874.4,8.3M1066,353.3L976.9,89.9L949.3,8.3M1066,106.4L1048.9,63.4L1027,8.3M-29.3,478.4L-8.9,453.9M-29.3,509.9L10.5,453.9M-29.3,548.9L25.2,458.4L27.9,453.9M-27.6,595.8L38,465.5L43.9,453.9M233.4,566L244.6,566.2L295.8,566.6L347,566.4L356.6,566.3M-66.6,513L-59.2,515.5L-11.5,529.8L36.5,542.9L84.9,554.7L133.6,565.2L182.6,574.5L231.8,582.5L281.2,589.1L330.7,594.5L380.3,598.5L420.6,600.8M597.9,600.8L629.3,599.2L679,595.4L728.5,590.3L777.9,583.9L827.2,576.2L876.2,567.2L924.9,556.9L973.4,545.4L1021.5,532.5L1066,519.4M-66.6,399.3L-26.8,412.4L18.2,425.9L63.5,438.3L109.2,449.4L155.1,459.3L201.3,468.1L247.6,475.6L294.2,481.8L340.9,486.9L387.7,490.7L434.6,493.3L481.6,494.7L528.6,494.8L575.5,493.7L622.5,491.3L669.3,487.8L716,483L762.6,476.9L809,469.7L855.3,461.2L901.2,451.5L946.9,440.6L992.3,428.5L1037.4,415.2L1066,405.9M-66.6,283.4L-35.9,294.4L6,308.2L48.3,320.9L90.8,332.5L133.7,343L176.8,352.3L220.1,360.5L263.7,367.5L307.4,373.4L351.2,378.2L395.2,381.8L439.2,384.2L483.3,385.5L527.4,385.6L571.5,384.6L615.6,382.4L659.6,379L703.4,374.5L747.2,368.8L790.8,362L834.1,354L877.3,344.9L920.2,334.7L962.8,323.3L1005.1,310.9L1047.1,297.3L1066,290.6M-66.6,166.1L-39,176.8L-0.2,190.8L39,203.7L78.4,215.5L118.2,226.4L158.3,236.1L198.6,244.8L239.1,252.5L279.8,259.1L320.6,264.6L361.6,269L402.7,272.4L443.8,274.7L485.1,275.9L526.3,276L567.5,275L608.7,272.9L649.8,269.8L690.8,265.6L731.7,260.3L772.4,253.9L812.9,246.5L853.3,238L893.4,228.4L933.2,217.8L972.7,206.1L1012,193.4L1050.8,179.7L1066,173.9M-66.6,48L-36.5,60.6L-0.7,74.5L35.4,87.4L71.8,99.4L108.5,110.5L145.5,120.6L182.8,129.6L220.3,137.8L257.9,144.9L295.8,151L333.8,156.1L371.9,160.3L410.2,163.4L448.4,165.5L486.8,166.6L525.1,166.7L563.5,165.8L601.8,163.9L640,161L678.2,157L716.2,152.1L754.1,146.2L791.8,139.3L829.3,131.3L866.6,122.4L903.7,112.6L940.5,101.7L976.9,89.9L1013.1,77.2L1048.9,63.4L1066,56.4M0.6,594.6L3.7,595.8M143.8,8.3L172.5,16.1L207,24.5L241.7,32L276.6,38.6L311.6,44.3L346.8,49L382.1,52.9L417.5,55.8L453,57.7L488.5,58.8L524,58.8L559.5,58L595,56.2L630.4,53.5L665.7,49.9L700.9,45.3L736,39.8L770.9,33.4L805.7,26.1L840.2,17.9L874.5,8.7L875.9,8.3M-29.3,580.4L-21.8,584.3L-10.7,589.7L0.6,594.6M15,559.6L25.2,563.5L35.5,567.1L45.9,570.3L56.4,573.1L67.1,575.5L77.8,577.5L88.6,579.1L99.4,580.3L110.3,581.1L121.2,581.5L132.1,581.4L143,581L153.8,580.1L164.7,578.8L175.4,577.2L186.1,575.1L196.7,572.6L207.3,569.7L217.7,566.4L227.9,562.8L233.4,560.6M-29.3,536.6L-23.9,540L-14.5,545.4L-4.8,550.5L5,555.2L15,559.6M29.6,524.4L38.4,527.8L47.3,530.9L56.4,533.7L65.5,536.1L74.7,538.2L84.1,539.9L93.4,541.3L102.8,542.4L112.3,543L121.7,543.4L131.2,543.3L140.7,542.9L150.1,542.2L159.5,541.1L168.9,539.6L178.2,537.8L187.4,535.7L196.5,533.2L205.5,530.3L214.4,527.1L223.2,523.6L231.9,519.8L233.4,519.1M-29.3,490.1L-27.7,491.3L-20.1,497L-12.3,502.3L-4.2,507.3L4,512.1L12.3,516.5L20.9,520.6L29.6,524.4M44.1,489.1L51.6,492L59.2,494.7L66.8,497L74.6,499.1L82.4,500.9L90.3,502.3L98.3,503.5L106.3,504.4L114.3,505L122.3,505.2L130.3,505.2L138.4,504.9L146.4,504.2L154.4,503.3L162.3,502.1L170.2,500.5L178,498.7L185.7,496.6L193.4,494.2L201,491.5L208.4,488.5L215.8,485.2L223,481.7L230.1,477.9L233.4,476M-13.3,453.9L-10.7,456.1L-4.5,461.1L2,465.9L8.6,470.4L15.4,474.7L22.4,478.7L29.5,482.4L36.7,485.9L44.1,489.1M58.5,454.2L64.7,456.6L70.9,458.8L77.2,460.7L83.6,462.4L90.1,463.9L96.6,465.1L103.1,466.1L109.7,466.8L116.3,467.3L122.9,467.5L129.5,467.5L136.1,467.2L142.7,466.7L149.3,465.9L155.8,464.9L162.3,463.6L168.7,462.1L175.1,460.4L181.4,458.4L187.6,456.2L193.3,453.9M57.7,453.9L58.5,454.2';
  var US_XY = {"DEN01":[361.22,274.73],"BLD01":[357.19,268.39],"SLC01":[251.75,237.78],"BOI01":[195.9,163.37],"SEA01":[126.49,56.8],"PDX01":[108.99,98.86],"SAC01":[86.22,250.06],"AUS01":[477.2,488.73],"PHX01":[221.89,395.24],"ABQ01":[322.47,373.45],"CHI01":[644.01,228.96],"MSP01":[551.67,166.62]};

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
