/*
 * Build trailpeak-home.js from src/trailpeak-home.src.js plus the baked assets.
 *
 *   node build-home.mjs
 *
 * The two baked assets are checked in under src/ so a clone can rebuild without
 * network access. Regenerate them only when the geometry or the glyph set
 * changes; see src/README-baked.md.
 */
import { readFileSync, writeFileSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'src', 'trailpeak-home.src.js'), 'utf8');
const fonts = readFileSync(join(here, 'src', 'fonts-baked.js'), 'utf8');
const usmap = readFileSync(join(here, 'src', 'us-baked.js'), 'utf8');

const indent = (s) => s.trimEnd().split('\n').map(l => (l ? '  ' + l : l)).join('\n');

let out = src;
for (const [marker, asset, label] of [
  ['/*__BAKED_FONTS__*/', fonts, 'fonts'],
  ['/*__BAKED_USMAP__*/', usmap, 'usmap'],
]) {
  if (!out.includes(marker)) throw new Error(`marker ${marker} not found in source`);
  out = out.replace(marker, indent(asset));
  console.log(`  injected ${label}: ${asset.length} chars`);
}

const dest = join(here, 'trailpeak-home.js');
writeFileSync(dest, out);

const version = (src.match(/var VERSION = '([^']+)'/) || [])[1];
console.log('');
console.log('  source   :', src.length, 'chars');
console.log('  built    :', out.length, 'chars ->', dest);
console.log('  VERSION  :', version);
console.log('');
console.log('  Remember: the tag must match VERSION, i.e. trailpeak-home-v' + version);
