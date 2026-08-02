/*
 * Pre-project the US outline ONCE, here, and emit plain SVG path data.
 *
 * The prototype did this at runtime: load d3 (280KB), load topojson-client,
 * fetch world-atlas countries-110m.json (~110KB), then project. That is three
 * extra network round trips inside a Power BI visual whose whole design budget
 * is one pinned file. Projection is a pure function of fixed inputs, so it
 * belongs at build time.
 *
 * Output is a canonical 1000x620 viewBox. The SVG scales to whatever the map
 * panel ends up being, and the baked store coordinates stay in the same space.
 */
import { readFileSync, writeFileSync } from 'fs';
import { geoAlbersUsa, geoPath, geoGraticule } from 'd3-geo';
import { feature } from 'topojson-client';

const W = 1000, H = 620;
const topo = JSON.parse(readFileSync('countries-110m.json', 'utf8'));
const world = feature(topo, topo.objects.countries);
const us = world.features.filter(d => String(d.id) === '840')[0];
if (!us) throw new Error('USA feature (id 840) not found');

// Same extent maths as the prototype, scaled to the canonical box.
const proj = geoAlbersUsa().fitExtent([[26, 26], [W - 26, H - 30]], us);
const path = geoPath(proj);

const land = path(us);
const grat = path(geoGraticule().step([5, 5])());

const STORES = [
  ['DEN01', 39.74, -104.99], ['BLD01', 40.01, -105.27], ['SLC01', 40.76, -111.89],
  ['BOI01', 43.62, -116.20], ['SEA01', 47.61, -122.33], ['PDX01', 45.52, -122.68],
  ['SAC01', 38.58, -121.49], ['AUS01', 30.27, -97.74],  ['PHX01', 33.45, -112.07],
  ['ABQ01', 35.08, -106.65], ['CHI01', 41.88, -87.63],  ['MSP01', 44.98, -93.27]
];

const xy = {};
for (const [code, lat, lon] of STORES) {
  const p = proj([lon, lat]);
  if (!p) throw new Error('projection returned null for ' + code);
  xy[code] = [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100];
}

// Trim coordinate precision. At a 1000px box, 1 decimal is a tenth of a pixel
// and shaves roughly a third off the string.
const trim = d => d.replace(/-?\d+\.\d+/g, m => {
  const v = Math.round(parseFloat(m) * 10) / 10;
  return String(v);
});

const landT = trim(land), gratT = trim(grat);

const out =
`/* Baked by bake.mjs from world-atlas@2.0.2 countries-110m, projected with
   d3.geoAlbersUsa().fitExtent([[26,26],[${W - 26},${H - 30}]]). viewBox 0 0 ${W} ${H}.
   Regenerate rather than hand-edit. */
var US_VIEWBOX = '0 0 ${W} ${H}';
var US_LAND = '${landT}';
var US_GRAT = '${gratT}';
var US_XY = ${JSON.stringify(xy)};
`;

writeFileSync('us-baked.js', out);

console.log('viewBox      :', W, 'x', H);
console.log('land path    :', land.length, '->', landT.length, 'chars');
console.log('graticule    :', grat.length, '->', gratT.length, 'chars');
console.log('store coords :', Object.keys(xy).length);
console.log('total baked  :', out.length, 'chars');
console.log('');
const xs = Object.values(xy).map(p => p[0]), ys = Object.values(xy).map(p => p[1]);
console.log('store x range:', Math.min(...xs).toFixed(1), '..', Math.max(...xs).toFixed(1));
console.log('store y range:', Math.min(...ys).toFixed(1), '..', Math.max(...ys).toFixed(1));
console.log('sample       : DEN01', xy.DEN01, ' SEA01', xy.SEA01, ' AUS01', xy.AUS01);
