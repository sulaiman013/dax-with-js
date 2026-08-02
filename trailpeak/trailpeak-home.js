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
 * WHY THE GEOMETRY IS BAKED
 * ---------------------------------------------------------------------------
 * The design prototype fetched d3 v7 (~280KB), topojson-client and
 * world-atlas countries-110m.json, then projected at runtime. Inside a Power BI
 * visual that is three requests from a null-origin iframe on a tenant that may
 * block any of them. Projection is a pure function of fixed inputs, so it moved
 * to build time: ~10KB of SVG path data replacing ~400KB of library and atlas.
 *
 * Typography is Segoe UI, deliberately. This page sits beside native Power BI
 * pages and has to look like it belongs to them, and Segoe UI is what Power BI
 * itself renders in. That also removes the last webfont request.
 *
 * WHY IT SHIPS GRAIN
 * ---------------------------------------------------------------------------
 * A native visual filters because the engine re-queries at grain. This visual
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
 *    native Power BI buttons sitting over the header band, not markup in here.
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

  var VERSION = '3.0.0';
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
   * 3. DESIGN TOKENS
   * Sampled from the main report page so the two read as one product.
   * ---------------------------------------------------------------------- */
  var GRN_D = '#0e4d2b',   /* header band, dark end   */
      GRN_M = '#2e7d4f',   /* header band, light end  */
      GRN   = '#107c41',   /* positive / accent       */
      GRN_B = '#1e6b43',   /* solid data green        */
      RED   = '#c4314b',   /* negative                */
      AMB   = '#c77700',   /* behind budget on the map */
      INK   = '#1b1b1b',
      MUTE  = '#616e7c',
      FAINT = '#8a949e',
      LINE  = '#e5e7e9',
      PANEL = '#ffffff',
      BG    = '#f2f3f4';

  var REGION_COLOR = { Mountain: '#1e6b43', Pacific: '#2b7a9b', Midwest: '#6b4fa0', Southwest: '#b5701f' };
  var CAT_COLOR = {
    'Camping & Hiking': '#1e6b43', 'Climbing': '#6b4fa0', 'Accessories': '#2b7a9b',
    'Winter Sports': '#3f7f9e', 'Apparel': '#b5701f', 'Footwear': '#9b4a6d'
  };

  var UI = "'Segoe UI','Segoe UI Web (West European)',system-ui,-apple-system,Roboto,Arial,sans-serif";

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

  /* The header band leaves this slot empty. Native Power BI page-navigation
     buttons are positioned over it in the PBIR definition, because a custom
     visual has no handle on IVisualHost and cannot navigate pages itself. */
  var NAV_SLOT = { x: 690, w: 540 };

  /* -------------------------------------------------------------------------
   * 4. STYLES
   * ---------------------------------------------------------------------- */
  var CSS = [
    '.tph{position:absolute;inset:0;overflow:hidden;background:' + BG + ';font-family:' + UI + ';',
    '  color:' + INK + ';-webkit-font-smoothing:antialiased;contain:strict;font-size:13px}',
    '.tph *,.tph *::before,.tph *::after{box-sizing:border-box}',
    '.tph-stage{position:absolute;top:0;left:0;width:1920px;height:1080px;transform-origin:0 0;',
    '  background:' + BG + ';display:flex;flex-direction:column;overflow:hidden}',
    '.tph em{font-style:normal;font-variant-numeric:tabular-nums}',

    /* ---- header band ---- */
    '.tph-hd{flex:0 0 auto;height:76px;display:flex;align-items:center;justify-content:space-between;',
    '  padding:0 26px;background:linear-gradient(90deg,' + GRN_D + ' 0%,' + GRN_M + ' 100%);color:#fff}',
    '.tph-hd h1{margin:0;font-size:20px;font-weight:600;letter-spacing:-.01em;line-height:1.15}',
    '.tph-hd p{margin:3px 0 0;font-size:10.5px;letter-spacing:.14em;color:rgba(255,255,255,.72);',
    '  text-transform:uppercase}',
    '.tph-hdr{text-align:right}',
    '.tph-hdr b{display:block;font-size:15px;font-weight:600}',
    '.tph-hdr span{display:block;font-size:11px;color:rgba(255,255,255,.75);margin-top:2px}',

    /* ---- filter bar ---- */
    '.tph-fb{flex:0 0 auto;display:flex;align-items:center;gap:14px;padding:10px 26px;',
    '  background:' + PANEL + ';border-bottom:1px solid ' + LINE + '}',
    '.tph-fl{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:' + FAINT + ';flex:0 0 auto}',
    '.tph-chips{display:flex;gap:6px;flex:0 0 auto}',
    '.tph-chip{cursor:pointer;font-family:inherit;font-size:12px;padding:5px 13px;border-radius:14px;',
    '  border:1px solid #d0d4d8;background:#fff;color:#333;transition:all .14s ease;white-space:nowrap}',
    '.tph-chip:hover{border-color:' + GRN + ';color:' + GRN + '}',
    '.tph-chip.on{background:' + GRN + ';border-color:' + GRN + ';color:#fff;font-weight:600}',
    '.tph-sel{font-family:inherit;font-size:12px;padding:5px 8px;border-radius:4px;border:1px solid #d0d4d8;',
    '  background:#fff;color:#333;min-width:150px;cursor:pointer}',
    '.tph-stat{margin-left:auto;font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;',
    '  color:' + FAINT + ';white-space:nowrap}',
    '.tph-reset{cursor:pointer;font-family:inherit;font-size:11.5px;padding:5px 12px;border-radius:4px;',
    '  border:1px solid #d0d4d8;background:#fff;color:' + MUTE + ';flex:0 0 auto}',
    '.tph-reset:hover{border-color:' + RED + ';color:' + RED + '}',
    '.tph-reset[disabled]{opacity:.4;cursor:default}',

    /* ---- KPI strip ---- */
    '.tph-kpis{flex:0 0 auto;display:grid;grid-template-columns:repeat(6,1fr);gap:10px;padding:12px 26px 0}',
    '.tph-kpi{background:' + PANEL + ';border:1px solid ' + LINE + ';border-radius:6px;padding:11px 14px 12px;',
    '  position:relative;overflow:hidden}',
    '.tph-kpi.acc::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:' + RED + '}',
    '.tph-kl{font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:' + FAINT + '}',
    '.tph-kv{margin-top:6px;font-size:26px;font-weight:600;letter-spacing:-.02em;line-height:1.1;',
    '  font-variant-numeric:tabular-nums}',
    '.tph-ks{margin-top:5px;font-size:11.5px;color:' + MUTE + ';font-variant-numeric:tabular-nums}',

    /* ---- main grid ---- */
    '.tph-main{flex:1 1 auto;display:grid;grid-template-columns:1fr 470px;gap:10px;padding:10px 26px 0;min-height:0}',
    /* Grid and flex children default to min-height:auto, which means they
       refuse to shrink below their content and happily overflow the row. Every
       level of this stack has to opt out explicitly or the league table pushes
       past the bottom of the page. */
    '.tph-main>*{min-height:0}',
    '.tph-col{display:flex;flex-direction:column;gap:10px;min-height:0}',
    '.tph-card{background:' + PANEL + ';border:1px solid ' + LINE + ';border-radius:6px;display:flex;',
    '  flex-direction:column;min-height:0;overflow:hidden}',
    /* The map card is the one element that should absorb the leftover height.
       Without this it sizes to its header and legend, the SVG gets zero rows to
       paint into, and the map silently disappears. */
    '.tph-col>.tph-card{flex:1 1 auto}',
    '.tph-ch{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:11px 16px 8px}',
    '.tph-ch h2{margin:0;font-size:14px;font-weight:600}',
    '.tph-ch small{font-size:11.5px;color:' + FAINT + '}',
    '.tph-ch .r{margin-left:auto;display:flex;gap:6px;align-items:center}',
    '.tph-hint{font-size:11px;color:' + FAINT + '}',

    /* ---- map ---- */
    '.tph-mapw{flex:1 1 auto;min-height:120px;position:relative}',
    '.tph-mapw svg{position:absolute;inset:0;width:100%;height:100%;display:block}',
    '.tph-node{cursor:pointer;transition:opacity .16s ease}',
    '.tph-legend{flex:0 0 auto;display:flex;align-items:center;gap:20px;padding:0 16px 11px;',
    '  font-size:11px;color:' + MUTE + '}',
    '.tph-legend span{display:flex;align-items:center;gap:6px}',
    '.tph-legend i{width:9px;height:9px;border-radius:50%;font-style:normal}',
    '.tph-legend .r{margin-left:auto;color:' + FAINT + '}',

    /* ---- trend ---- */
    '.tph-trend{flex:0 0 186px}',
    '.tph-tl{display:flex;gap:16px;font-size:11px;color:' + MUTE + '}',
    '.tph-tl span{display:flex;align-items:center;gap:6px}',
    '.tph-tl i{width:14px;height:2px;font-style:normal}',
    '.tph-tsvg{flex:1 1 auto;min-height:0;padding:0 16px 8px}',
    '.tph-tsvg svg{display:block;width:100%;height:100%}',

    /* ---- leaderboard ---- */
    '.tph-seg{display:flex;border:1px solid #d0d4d8;border-radius:4px;overflow:hidden}',
    '.tph-seg button{cursor:pointer;border:none;font-family:inherit;font-size:11.5px;padding:5px 13px;',
    '  background:#fff;color:' + MUTE + ';transition:all .14s ease}',
    '.tph-seg button+button{border-left:1px solid #d0d4d8}',
    '.tph-seg button.on{background:' + GRN + ';color:#fff;font-weight:600}',
    '.tph-mtabs{flex:0 0 auto;display:flex;gap:6px;padding:0 16px 8px}',
    '.tph-mtabs button{cursor:pointer;flex:1 1 0;font-family:inherit;font-size:11px;padding:6px 0;',
    '  border-radius:4px;background:#fff;border:1px solid #d0d4d8;color:' + MUTE + ';transition:all .14s ease}',
    '.tph-mtabs button.on{background:rgba(16,124,65,.10);border-color:' + GRN + ';color:' + GRN + ';font-weight:600}',

    '.tph-rows{flex:1 1 auto;min-height:0;overflow:auto;padding:0 8px 10px}',
    '.tph-rows::-webkit-scrollbar{width:8px}',
    '.tph-rows::-webkit-scrollbar-thumb{background:#d6d9dc;border-radius:4px}',
    '.tph-rhd{display:grid;grid-template-columns:24px 1fr 92px 78px;gap:8px;padding:0 8px 5px;',
    '  font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:' + FAINT + ';',
    '  position:sticky;top:0;background:' + PANEL + ';z-index:1}',
    '.tph-rhd span:nth-child(3),.tph-rhd span:nth-child(4){text-align:right}',
    '.tph-row{display:grid;grid-template-columns:24px 1fr 92px 78px;gap:8px;align-items:center;',
    '  padding:5px 8px;border-radius:4px;cursor:pointer;transition:background .14s ease,opacity .14s ease;',
    '  border-bottom:1px solid #f0f1f2}',
    '.tph-row:hover{background:#f6f7f8}',
    '.tph-row.on{background:rgba(16,124,65,.09)}',
    '.tph-row.off{opacity:.34}',
    '.tph-rk{font-size:11px;color:' + FAINT + ';font-variant-numeric:tabular-nums}',
    '.tph-rm{min-width:0}',
    '.tph-rt{display:flex;align-items:center;gap:7px}',
    '.tph-rt i{width:8px;height:8px;border-radius:2px;flex:0 0 auto;font-style:normal}',
    '.tph-rt b{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.tph-bar{height:4px;border-radius:2px;background:#eceef0;overflow:hidden;margin-top:4px}',
    '.tph-bar i{display:block;height:100%;border-radius:2px;font-style:normal;',
    '  transition:width .45s cubic-bezier(.22,1,.36,1)}',
    '.tph-rs{display:block;font-size:10.5px;color:' + FAINT + ';margin-top:3px}',
    '.tph-rv{text-align:right;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}',
    '.tph-rd{text-align:right;font-size:11.5px;font-variant-numeric:tabular-nums}',

    '.tph-detail{flex:0 0 auto;margin:0 16px 10px;padding:11px 13px;border-radius:5px;',
    '  background:rgba(16,124,65,.07);border:1px solid rgba(16,124,65,.28)}',
    '.tph-dh{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}',
    '.tph-dh h3{margin:0;font-size:14px;font-weight:600}',
    '.tph-dh p{margin:2px 0 0;font-size:11px;color:' + MUTE + '}',
    '.tph-dh button{cursor:pointer;background:#fff;border:1px solid #d0d4d8;color:' + MUTE + ';',
    '  border-radius:4px;font-family:inherit;font-size:11px;padding:4px 9px;flex:0 0 auto}',
    '.tph-dh button:hover{border-color:' + RED + ';color:' + RED + '}',
    '.tph-dg{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:10px}',
    '.tph-dg div span:first-child{display:block;font-size:9.5px;letter-spacing:.1em;',
    '  text-transform:uppercase;color:' + FAINT + '}',
    '.tph-dg div span:last-child{display:block;margin-top:3px;font-size:14px;font-weight:600;',
    '  font-variant-numeric:tabular-nums}',

    '.tph-build{position:absolute;right:10px;bottom:5px;font-size:9px;color:#c3c8cc;pointer-events:none}',
    '.tph-empty{padding:26px 16px;font-size:12.5px;color:' + FAINT + ';text-align:center}',
    '.tph-fail{position:absolute;inset:0;display:grid;place-items:center;background:' + BG + ';padding:40px;',
    '  text-align:center}',
    '.tph-fail b{display:block;font-size:16px;color:' + RED + ';margin-bottom:9px}',
    '.tph-fail p{margin:0;font-size:13px;line-height:1.65;color:' + MUTE + ';max-width:620px}'
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
  function dollars(c) {
    if (!isNum(c)) return '—';
    return (c < 0 ? '-$' : '$') + Math.round(Math.abs(c) / 100).toLocaleString('en-US');
  }
  function pct(x, dp) { return !isNum(x) ? '—' : (x * 100).toFixed(dp == null ? 1 : dp) + '%'; }
  function thou(n) { return !isNum(n) ? '—' : Math.round(n).toLocaleString('en-US'); }
  function signed(c) { return !isNum(c) ? '—' : (c >= 0 ? '+' : '') + dollars(c); }

  /* -------------------------------------------------------------------------
   * 6. STATE
   * Versioned: it survives the DOM replacement, which is the point, but it must
   * not survive a build that changes what the fields mean.
   * ---------------------------------------------------------------------- */
  var S = window.__tphState;
  if (!S || S.v !== VERSION) {
    S = window.__tphState = {
      v: VERSION, regions: [], store: null, cats: [],
      mode: 'stores', metric: 'rev', hover: null
    };
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
    (raw.dim && raw.dim.p || []).forEach(function (p) {
      d.products.push({ k: p[0], sku: p[1], name: p[2], cat: p[3] });
    });

    d.storeBy = {}; d.stores.forEach(function (s) { d.storeBy[s.k] = s; });
    d.monthIx = {}; d.months.forEach(function (m, i) { d.monthIx[m.k] = i; });
    d.prodBy = {}; d.products.forEach(function (p) { d.prodBy[p.k] = p; });

    d.regions = [];
    d.stores.forEach(function (s) { if (d.regions.indexOf(s.region) < 0) d.regions.push(s.region); });
    d.regions.sort();
    d.cats = [];
    d.products.forEach(function (p) { if (d.cats.indexOf(p.cat) < 0) d.cats.push(p.cat); });
    d.cats.sort();
    return d;
  }

  /* -------------------------------------------------------------------------
   * 8. THE FILTER MODEL
   *
   * Two levels, deliberately, because that is how a native page behaves:
   *
   *   SCOPE    the region chips. A slicer. Everything obeys it, including the
   *            store league table and the map.
   *   FOCUS    a selected store. A cross-filter. The KPI strip, the trend and
   *            the product table re-scope to it, while the store table and the
   *            map keep every in-scope store visible and merely highlight it,
   *            which is exactly what a native bar chart does when you click one
   *            of its bars.
   * ---------------------------------------------------------------------- */
  function inScope(s) { return !S.regions.length || S.regions.indexOf(s.region) >= 0; }

  function scopeStores() { return D.stores.filter(inScope); }

  function focusSet() {
    var out = {}, list = scopeStores();
    if (S.store != null && D.storeBy[S.store] && inScope(D.storeBy[S.store])) out[S.store] = 1;
    else list.forEach(function (s) { out[s.k] = 1; });
    return out;
  }

  function catSet() {
    if (!S.cats.length) return null;
    var m = {};
    D.products.forEach(function (p) { if (S.cats.indexOf(p.cat) >= 0) m[p.k] = 1; });
    return m;
  }

  /* Sum store x month over a store set. One linear pass, no allocation per row. */
  function aggregate(sset) {
    var f = D.f, nM = D.months.length;
    var tot = { rev: 0, gp: 0, eb: 0, op: 0, br: 0, bo: 0, un: 0 };
    var byM = [];
    for (var i = 0; i < nM; i++) byM.push({ rev: 0, gp: 0, op: 0, bo: 0, br: 0 });
    for (var j = 0; j < f.length; j += 9) {
      if (!sset[f[j]]) continue;
      var mi = D.monthIx[f[j + 1]];
      var rev = f[j + 2] || 0, gp = f[j + 3] || 0, eb = f[j + 4] || 0,
          op = f[j + 5] || 0, br = f[j + 6] || 0, bo = f[j + 7] || 0, un = f[j + 8] || 0;
      tot.rev += rev; tot.gp += gp; tot.eb += eb; tot.op += op;
      tot.br += br; tot.bo += bo; tot.un += un;
      if (mi != null) {
        var m = byM[mi];
        m.rev += rev; m.gp += gp; m.op += op; m.bo += bo; m.br += br;
      }
    }
    return { tot: tot, byM: byM };
  }

  /* Per-store totals over the whole in-scope period. */
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

  /* Product totals over a store set. This is the array that makes the product
     league table follow the region chips instead of ignoring them. */
  function byProduct(sset) {
    var x = D.x, out = {}, cs = catSet();
    for (var j = 0; j < x.length; j += 5) {
      var pk = x[j];
      if (!sset[x[j + 1]]) continue;
      if (cs && !cs[pk]) continue;
      var o = out[pk] || (out[pk] = { rev: 0, un: 0, gp: 0 });
      o.rev += x[j + 2] || 0; o.un += x[j + 3] || 0; o.gp += x[j + 4] || 0;
    }
    return out;
  }

  /* -------------------------------------------------------------------------
   * 9. HEADER + FILTER BAR
   * ---------------------------------------------------------------------- */
  function buildHeader(d) {
    var n = el('div', NS + '-hd');
    var b = el('div');
    b.appendChild(el('h1', null, esc('TrailPeak Outfitters')));
    b.appendChild(el('p', null, 'Finance · Monthly Reporting'));
    n.appendChild(b);

    /* Deliberately empty. Native page-navigation buttons live over this slot. */
    var slot = el('div');
    slot.style.cssText = 'width:' + NAV_SLOT.w + 'px;flex:0 0 auto';
    slot.setAttribute('aria-hidden', 'true');
    n.appendChild(slot);

    var r = el('div', NS + '-hdr');
    r.appendChild(el('b', null, esc((d.meta.first || '') + ' – ' + (d.meta.last || ''))));
    r.appendChild(el('span', null, esc(d.meta.through || '')));
    n.appendChild(r);
    return n;
  }

  function buildFilterBar(d) {
    var n = el('div', NS + '-fb');

    n.appendChild(el('span', NS + '-fl', 'Region'));
    var rc = el('div', NS + '-chips');
    d.regions.forEach(function (r) {
      var b = el('button', NS + '-chip' + (S.regions.indexOf(r) >= 0 ? ' on' : ''), esc(r));
      b.type = 'button';
      b.setAttribute('data-region', r);
      b.setAttribute('aria-pressed', S.regions.indexOf(r) >= 0 ? 'true' : 'false');
      rc.appendChild(b);
    });
    n.appendChild(rc);

    n.appendChild(el('span', NS + '-fl', 'Store'));
    var sel = el('select', NS + '-sel');
    sel.setAttribute('data-storesel', '1');
    sel.setAttribute('aria-label', 'Filter to a single store');
    var opts = '<option value="">All stores</option>';
    scopeStores().forEach(function (s) {
      opts += '<option value="' + s.k + '"' + (S.store === s.k ? ' selected' : '') + '>' +
        esc(s.name) + '</option>';
    });
    sel.innerHTML = opts;
    n.appendChild(sel);

    n.appendChild(el('span', NS + '-fl', 'Category'));
    var cc = el('div', NS + '-chips');
    d.cats.forEach(function (c) {
      var b = el('button', NS + '-chip' + (S.cats.indexOf(c) >= 0 ? ' on' : ''), esc(c));
      b.type = 'button';
      b.setAttribute('data-cat', c);
      b.setAttribute('aria-pressed', S.cats.indexOf(c) >= 0 ? 'true' : 'false');
      cc.appendChild(b);
    });
    n.appendChild(cc);

    var scope = scopeStores(), focus = focusSet();
    var nFocus = Object.keys(focus).length;
    var nCats = S.cats.length || d.cats.length;
    n.appendChild(el('span', NS + '-stat',
      d.months.length + ' months · ' + nFocus + ' of ' + d.stores.length + ' stores · ' +
      nCats + ' of ' + d.cats.length + ' categories'));

    var rb = el('button', NS + '-reset', 'Reset all');
    rb.type = 'button';
    rb.setAttribute('data-reset', '1');
    if (!S.regions.length && S.store == null && !S.cats.length) rb.disabled = true;
    n.appendChild(rb);
    return n;
  }

  /* -------------------------------------------------------------------------
   * 10. KPI STRIP
   * ---------------------------------------------------------------------- */
  function buildKpis(d, agg) {
    var wrap = el('div', NS + '-kpis');
    var t = agg.tot;
    var gm = t.rev ? t.gp / t.rev : null;
    var ebPct = t.rev ? t.eb / t.rev : null;
    var opPct = t.rev ? t.op / t.rev : null;
    var revVar = t.rev - t.br;
    var opVar = t.op - t.bo;

    /* The vital few, recomputed under the current filter. A top-20% computed at
       company level is the wrong 20% the moment someone picks a region. */
    var prod = byProduct(focusSet());
    var pv = Object.keys(prod).map(function (k) { return prod[k].rev; }).sort(function (a, b) { return b - a; });
    var totP = pv.reduce(function (a, b) { return a + b; }, 0);
    var run = 0, vital = 0;
    for (var i = 0; i < pv.length; i++) { run += pv[i]; vital++; if (run >= totP * 0.8) break; }

    var items = [
      { l: 'Net revenue', v: dollars(t.rev),
        s: signed(revVar) + ' vs budget', c: revVar >= 0 ? GRN : RED },
      { l: 'Gross profit', v: dollars(t.gp), s: pct(gm) + ' margin', c: MUTE },
      { l: 'EBITDA', v: dollars(t.eb), s: pct(ebPct) + ' of revenue', c: MUTE },
      { l: 'Operating profit', v: dollars(t.op),
        s: signed(opVar) + ' vs budget', c: opVar >= 0 ? GRN : RED, acc: opVar < 0 },
      { l: 'Units sold', v: thou(t.un), s: dollars(totP) + ' product revenue', c: MUTE },
      { l: 'Vital few', v: vital + ' of ' + pv.length, s: 'SKUs drive 80%', c: MUTE }
    ];

    items.forEach(function (it) {
      var c = el('div', NS + '-kpi' + (it.acc ? ' acc' : ''));
      c.appendChild(el('div', NS + '-kl', esc(it.l)));
      c.appendChild(el('div', NS + '-kv', esc(it.v)));
      var s = el('div', NS + '-ks', esc(it.s));
      s.style.color = it.c;
      c.appendChild(s);
      wrap.appendChild(c);
    });
    return wrap;
  }

  /* -------------------------------------------------------------------------
   * 11. MAP
   * ---------------------------------------------------------------------- */
  function buildMap(d, tots) {
    var panel = el('div', NS + '-card');
    var head = el('div', NS + '-ch');
    head.appendChild(el('h2', null, 'Store network'));
    var scope = scopeStores();
    head.appendChild(el('small', null, scope.length + ' stores · bubble = ' +
      (S.metric === 'op' ? 'operating profit' : S.metric === 'gm' ? 'margin' : 'revenue')));
    head.appendChild(el('span', NS + '-hint r', 'Click a store to cross-filter the page'));
    panel.appendChild(head);

    var wrap = el('div', NS + '-mapw');
    var gid = NS + 'g' + (++uid), cid = NS + 'c' + uid;

    function mval(k) {
      var o = tots[k] || {};
      return S.metric === 'op' ? Math.max(0, o.op) : S.metric === 'gm' ? (o.rev ? o.gp / o.rev * 1e6 : 0) : o.rev;
    }
    var mx = 1;
    scope.forEach(function (s) { mx = Math.max(mx, mval(s.k)); });

    var nodes = '';
    d.stores.forEach(function (s, i) {
      if (s.x == null) return;
      var sc = inScope(s);
      var o = tots[s.k] || { rev: 0, op: 0, bo: 0 };
      var rad = sc ? Math.max(6, Math.sqrt(mval(s.k) / mx) * 34) : 6;
      var ahead = (o.op - o.bo) >= 0;
      var col = ahead ? GRN_B : AMB;
      var isF = (S.hover || S.store) === s.k;
      var dim = !sc || ((S.hover || S.store) != null && !isF);
      var lx = s.dx + (s.anchor === 'end' ? -rad : s.anchor === 'middle' ? 0 : rad);
      var ly = s.dy + (s.anchor === 'middle' ? (s.dy < 0 ? -rad + 4 : rad - 2) : 4);

      nodes +=
        '<g class="' + NS + '-node" data-store="' + s.k + '" transform="translate(' + s.x + ',' + s.y + ')" ' +
        'opacity="' + (dim ? 0.24 : 1) + '" tabindex="0" role="button" aria-label="' +
        esc(s.name + ', ' + dollars(o.rev)) + '">' +
        (sc ? '<circle r="' + (rad * 2.2).toFixed(1) + '" fill="url(#' + gid + ')"></circle>' : '') +
        '<circle r="' + (isF ? rad + 9 : rad).toFixed(1) + '" fill="none" stroke="' + col +
        '" stroke-width="1.4" opacity="' + (isF ? 0.85 : 0) + '"></circle>' +
        '<circle r="' + rad.toFixed(1) + '" fill="' + col + '" fill-opacity="' +
        (isF ? 0.55 : (s.tier === 'Flagship' ? 0.34 : 0.22)) + '" stroke="' + col +
        '" stroke-width="' + (s.tier === 'Flagship' ? 1.6 : 1.1) + '"></circle>' +
        '<circle r="' + Math.max(1.8, rad * 0.14).toFixed(1) + '" fill="' + col + '"></circle>' +
        '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="' + s.anchor +
        '" font-family="' + UI.replace(/"/g, "'") + '" font-size="10.5" fill="' +
        (isF ? INK : MUTE) + '" font-weight="' + (isF ? 600 : 400) + '">' + esc(s.city) + '</text>' +
        (isF ? '<text x="' + lx.toFixed(1) + '" y="' + (ly + 12).toFixed(1) + '" text-anchor="' + s.anchor +
          '" font-family="' + UI.replace(/"/g, "'") + '" font-size="10.5" fill="' + col +
          '" font-weight="600">' + esc(dollars(o.rev)) + '</text>' : '') +
        '</g>';
    });

    wrap.innerHTML =
      '<svg viewBox="' + US_VIEWBOX + '" preserveAspectRatio="xMidYMid meet" role="img" ' +
      'aria-label="Map of the United States with store locations sized by revenue">' +
      '<defs><radialGradient id="' + gid + '">' +
      '<stop offset="0%" stop-color="rgba(30,107,67,.16)"></stop>' +
      '<stop offset="100%" stop-color="rgba(30,107,67,0)"></stop></radialGradient>' +
      '<clipPath id="' + cid + '"><path d="' + US_LAND + '"></path></clipPath></defs>' +
      '<path d="' + US_LAND + '" fill="#eef1f0" stroke="#c9d2ce" stroke-width="1" stroke-linejoin="round"></path>' +
      '<path d="' + US_GRAT + '" fill="none" stroke="rgba(0,0,0,.035)" stroke-width="0.5" ' +
      'clip-path="url(#' + cid + ')"></path>' +
      '<g>' + nodes + '</g></svg>';
    panel.appendChild(wrap);

    var lg = el('div', NS + '-legend');
    lg.innerHTML =
      '<span><i style="background:' + GRN_B + ';opacity:.45;border:1px solid ' + GRN_B + '"></i>Ahead of budget</span>' +
      '<span><i style="background:' + AMB + ';opacity:.45;border:1px solid ' + AMB + '"></i>Behind budget</span>' +
      '<span class="r">Bubble area is proportional to the selected measure</span>';
    panel.appendChild(lg);
    return panel;
  }

  /* -------------------------------------------------------------------------
   * 12. TREND
   * ---------------------------------------------------------------------- */
  function buildTrend(d, agg) {
    var n = el('div', NS + '-card ' + NS + '-trend');
    var head = el('div', NS + '-ch');
    head.appendChild(el('h2', null, 'Revenue and operating profit by month'));
    head.appendChild(el('small', null, d.months.length + ' closed months'));
    head.appendChild(el('div', NS + '-tl r',
      '<span><i style="background:' + GRN_B + '"></i>Revenue</span>' +
      '<span><i style="background:' + GRN + '"></i>Operating profit</span>' +
      '<span><i style="background:#a9b2ba"></i>Budget</span>'));
    n.appendChild(head);

    var m = agg.byM;
    if (m.length < 2) { n.appendChild(el('div', NS + '-empty', 'Not enough closed months to plot a trend.')); return n; }

    var W = 1000, H = 118, PADL = 8, PADR = 8, gid = NS + 't' + (++uid);
    var revs = m.map(function (r) { return r.rev; });
    var ops = m.map(function (r) { return r.op; });
    var bos = m.map(function (r) { return r.bo; });

    function band(vals, dom, y0, y1) {
      var mn = Math.min.apply(null, dom), mx = Math.max.apply(null, dom), sp = (mx - mn) || 1;
      return vals.map(function (v, i) {
        return { x: PADL + i / (vals.length - 1) * (W - PADL - PADR), y: y1 - (v - mn) / sp * (y1 - y0) };
      });
    }
    function toPath(ps) {
      return ps.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
    }
    var revPts = band(revs, revs.concat([0]), 6, 58);
    var opDom = ops.concat(bos);
    var opPts = band(ops, opDom, 70, 104);
    var boPts = band(bos, opDom, 70, 104);

    var ticks = '';
    m.forEach(function (r, i) {
      if (i % 6 !== 0 && i !== m.length - 1) return;
      ticks += '<text x="' + (PADL + i / (m.length - 1) * (W - PADL - PADR)).toFixed(1) + '" y="116" ' +
        'fill="' + FAINT + '" font-family="' + UI.replace(/"/g, "'") + '" font-size="9" text-anchor="' +
        (i === 0 ? 'start' : i === m.length - 1 ? 'end' : 'middle') + '">' +
        esc(d.months[i] ? d.months[i].label : '') + '</text>';
    });

    var wrap = el('div', NS + '-tsvg');
    wrap.innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" ' +
      'aria-label="Monthly revenue and operating profit against budget">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="rgba(30,107,67,.22)"></stop>' +
      '<stop offset="100%" stop-color="rgba(30,107,67,.02)"></stop></linearGradient></defs>' +
      '<path d="' + toPath(revPts) + ' L' + (W - PADR) + ' 58 L' + PADL + ' 58 Z" fill="url(#' + gid + ')"></path>' +
      '<path d="' + toPath(revPts) + '" fill="none" stroke="' + GRN_B + '" stroke-width="1.8" ' +
      'stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>' +
      '<path d="' + toPath(boPts) + '" fill="none" stroke="#a9b2ba" stroke-width="1.2" ' +
      'stroke-dasharray="4 4" vector-effect="non-scaling-stroke"></path>' +
      '<path d="' + toPath(opPts) + '" fill="none" stroke="' + GRN + '" stroke-width="1.8" ' +
      'stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>' +
      ticks + '</svg>';
    n.appendChild(wrap);
    return n;
  }

  /* -------------------------------------------------------------------------
   * 13. LEADERBOARD
   * ---------------------------------------------------------------------- */
  var METRICS = {
    stores: [['rev', 'Revenue'], ['op', 'Op profit'], ['gm', 'Margin']],
    products: [['rev', 'Revenue'], ['op', 'Gross profit'], ['gm', 'Units']]
  };

  function buildBoard(d, tots) {
    var panel = el('div', NS + '-card');
    var head = el('div', NS + '-ch');
    head.appendChild(el('h2', null, "Who's winning"));
    var seg = el('div', NS + '-seg r');
    [['stores', 'Stores'], ['products', 'Products']].forEach(function (m) {
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
    var hd = el('div', NS + '-rhd');

    if (S.mode === 'stores') {
      hd.innerHTML = '<span>#</span><span>Store</span><span>' +
        esc(METRICS.stores.filter(function (m) { return m[0] === S.metric; })[0][1]) +
        '</span><span>vs budget</span>';
      rows.appendChild(hd);

      var scope = scopeStores();
      var valOf = function (s) {
        var o = tots[s.k] || {};
        return S.metric === 'op' ? o.op : S.metric === 'gm' ? (o.rev ? o.gp / o.rev : 0) : o.rev;
      };
      var list = scope.slice().sort(function (a, b) { return valOf(b) - valOf(a); });
      var mx = Math.max.apply(null, list.map(function (s) { return Math.abs(valOf(s)); })) || 1;

      if (!list.length) rows.appendChild(el('div', NS + '-empty', 'No stores match the current filters.'));

      list.forEach(function (s, i) {
        var o = tots[s.k] || { rev: 0, op: 0, bo: 0, gp: 0 };
        var isF = (S.hover || S.store) === s.k;
        var dimmed = S.store != null && S.store !== s.k;
        var v = valOf(s), vr = o.op - o.bo;
        var row = el('div', NS + '-row' + (isF ? ' on' : '') + (dimmed ? ' off' : ''));
        row.setAttribute('data-store', s.k);
        row.setAttribute('tabindex', '0');
        row.innerHTML =
          '<span class="' + NS + '-rk">' + (i + 1) + '</span>' +
          '<div class="' + NS + '-rm"><div class="' + NS + '-rt"><i style="background:' +
          (REGION_COLOR[s.region] || GRN_B) + '"></i><b>' + esc(s.name) + '</b></div>' +
          '<div class="' + NS + '-bar"><i style="width:' + Math.round(Math.abs(v) / mx * 100) +
          '%;background:' + (REGION_COLOR[s.region] || GRN_B) + '"></i></div>' +
          '<span class="' + NS + '-rs">' + esc(s.region + ' · ' + s.tier + ' · ' +
          (o.rev ? pct(o.gp / o.rev) : '—') + ' GM') + '</span></div>' +
          '<div class="' + NS + '-rv">' + esc(S.metric === 'gm' ? (o.rev ? pct(o.gp / o.rev, 2) : '—') : dollars(v)) + '</div>' +
          '<div class="' + NS + '-rd" style="color:' + (vr >= 0 ? GRN : RED) + '">' + esc(signed(vr)) + '</div>';
        rows.appendChild(row);
      });
    } else {
      hd.innerHTML = '<span>#</span><span>Product</span><span>' +
        esc(METRICS.products.filter(function (m) { return m[0] === S.metric; })[0][1]) +
        '</span><span>margin</span>';
      rows.appendChild(hd);

      var prod = byProduct(focusSet());
      var keys = Object.keys(prod);
      var pvalOf = function (k) {
        var o = prod[k];
        return S.metric === 'op' ? o.gp : S.metric === 'gm' ? o.un : o.rev;
      };
      keys.sort(function (a, b) { return pvalOf(b) - pvalOf(a); });
      var pmx = keys.length ? pvalOf(keys[0]) || 1 : 1;

      if (!keys.length) rows.appendChild(el('div', NS + '-empty', 'No products match the current filters.'));

      keys.slice(0, 40).forEach(function (k, i) {
        var p = d.prodBy[k], o = prod[k];
        if (!p) return;
        var v = pvalOf(k);
        var row = el('div', NS + '-row');
        row.innerHTML =
          '<span class="' + NS + '-rk">' + (i + 1) + '</span>' +
          '<div class="' + NS + '-rm"><div class="' + NS + '-rt"><i style="background:' +
          (CAT_COLOR[p.cat] || GRN_B) + '"></i><b>' + esc(p.name) + '</b></div>' +
          '<div class="' + NS + '-bar"><i style="width:' + Math.round(v / pmx * 100) +
          '%;background:' + (CAT_COLOR[p.cat] || GRN_B) + '"></i></div>' +
          '<span class="' + NS + '-rs">' + esc(p.cat + ' · ' + p.sku) + '</span></div>' +
          '<div class="' + NS + '-rv">' + esc(S.metric === 'gm' ? thou(v) : dollars(v)) + '</div>' +
          '<div class="' + NS + '-rd" style="color:' + MUTE + '">' +
          esc(o.rev ? pct(o.gp / o.rev) : '—') + '</div>';
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
      s.region + ' · ' + thou(s.sqft) + ' sq ft')));
    h.appendChild(left);
    var cb = el('button', null, 'Clear');
    cb.type = 'button'; cb.setAttribute('data-close', '1');
    h.appendChild(cb);
    n.appendChild(h);

    var vr = (o.op || 0) - (o.bo || 0);
    var g = el('div', NS + '-dg');
    [['Revenue', dollars(o.rev), INK],
     ['Op profit', dollars(o.op), INK],
     ['vs budget', signed(vr), vr >= 0 ? GRN : RED],
     ['Rev / sq ft', s.sqft ? '$' + thou(Math.round((o.rev || 0) / 100 / s.sqft)) : '—', INK]
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
      /* A filter that no longer exists must not survive new data. */
      S.regions = S.regions.filter(function (r) { return D.regions.indexOf(r) >= 0; });
      S.cats = S.cats.filter(function (c) { return D.cats.indexOf(c) >= 0; });
      if (S.store != null && !D.storeBy[S.store]) S.store = null;
    }

    var tots = byStore();
    var agg = aggregate(focusSet());

    var stage = el('div', NS + '-stage');
    stage.appendChild(buildHeader(D));
    stage.appendChild(buildFilterBar(D));
    stage.appendChild(buildKpis(D, agg));

    var main = el('div', NS + '-main');
    var left = el('div', NS + '-col');
    left.appendChild(buildMap(D, tots));
    left.appendChild(buildTrend(D, agg));
    main.appendChild(left);
    main.appendChild(buildBoard(D, tots));
    stage.appendChild(main);

    var pad = el('div');
    pad.style.cssText = 'flex:0 0 auto;height:14px';
    stage.appendChild(pad);
    root.appendChild(stage);
    root.appendChild(el('div', NS + '-build', 'trailpeak-home v' + VERSION + ' · ' + (D.meta.build || 'dev')));

    V.root = root; V.stage = stage;
    V.rows = root.querySelector('.' + NS + '-rows');
    if (V.rows) V.rows.scrollTop = scrollTop;
    fitStage();

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
  function toggle(arr, v) {
    var i = arr.indexOf(v);
    if (i < 0) arr.push(v); else arr.splice(i, 1);
    return arr;
  }

  function wire(root) {
    root.addEventListener('click', function (e) {
      var t;
      if ((t = closest(e.target, '[data-region]'))) {
        toggle(S.regions, t.getAttribute('data-region'));
        /* A selected store outside the new scope is no longer a valid focus. */
        if (S.store != null && D.storeBy[S.store] && !inScope(D.storeBy[S.store])) S.store = null;
        return render();
      }
      if ((t = closest(e.target, '[data-cat]'))) { toggle(S.cats, t.getAttribute('data-cat')); return render(); }
      if ((t = closest(e.target, '[data-mode]'))) {
        S.mode = t.getAttribute('data-mode');
        if (!METRICS[S.mode].some(function (m) { return m[0] === S.metric; })) S.metric = 'rev';
        return render();
      }
      if ((t = closest(e.target, '[data-metric]'))) { S.metric = t.getAttribute('data-metric'); return render(); }
      if (closest(e.target, '[data-close]')) { S.store = null; return render(); }
      if (closest(e.target, '[data-reset]')) { S.regions = []; S.cats = []; S.store = null; return render(); }
      if ((t = closest(e.target, '[data-store]'))) {
        var k = +t.getAttribute('data-store');
        S.store = (S.store === k) ? null : k;
        return render();
      }
    });

    root.addEventListener('change', function (e) {
      var t = closest(e.target, '[data-storesel]');
      if (!t) return;
      S.store = t.value ? +t.value : null;
      render();
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
      if (e.key === 'Escape' && (S.store != null || S.regions.length || S.cats.length)) {
        S.regions = []; S.cats = []; S.store = null; render();
      }
    });

    if (typeof ResizeObserver === 'function') new ResizeObserver(fitStage).observe(root);
    else window.addEventListener('resize', fitStage);
  }

  /* Hover changes emphasis only. Repainting attributes in place is far cheaper
     than a rebuild and it stops the row list scrolling back to the top every
     time the pointer crosses a bubble. */
  function repaintFocus() {
    if (!D || !V.root) return;
    var focus = S.hover || S.store;
    var nodes = V.root.querySelectorAll('.' + NS + '-node');
    for (var i = 0; i < nodes.length; i++) {
      var g = nodes[i], k = +g.getAttribute('data-store'), s = D.storeBy[k];
      if (!s) continue;
      var sc = inScope(s);
      g.setAttribute('opacity', (!sc || (focus != null && focus !== k)) ? 0.24 : 1);
    }
    var rows = V.root.querySelectorAll('.' + NS + '-row[data-store]');
    for (var j = 0; j < rows.length; j++) {
      rows[j].classList.toggle('on', focus === +rows[j].getAttribute('data-store'));
    }
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
