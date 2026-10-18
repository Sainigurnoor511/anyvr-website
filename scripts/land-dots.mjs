// Samples Natural Earth land (world-atlas, 50m) into an even grid of dots for the hero globe.
import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import { geoContains } from 'd3-geo';

const topo = JSON.parse(readFileSync(new URL('../node_modules/world-atlas/land-50m.json', import.meta.url)));
const land = feature(topo, topo.objects.land);
const STEP = 1.5;
const dots = [];
for (let lat = -58; lat <= 82; lat += STEP) {
  const lonStep = STEP / Math.max(0.25, Math.cos((lat * Math.PI) / 180));
  for (let lon = -180; lon < 180; lon += lonStep) {
    if (geoContains(land, [lon, lat])) dots.push([+lat.toFixed(2), +lon.toFixed(2)]);
  }
}
writeFileSync(new URL('../public/data/land-dots.json', import.meta.url), JSON.stringify(dots));
console.log(`${dots.length} land dots`);
