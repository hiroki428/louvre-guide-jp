import fs from 'node:fs';
import {
  FLOORS,
  FLOOR_SUBTITLES,
  ROOM_ANCHORS,
  VIEW_H,
  VIEW_W,
  floorsOutput,
  footprintPolys,
  navOutPath,
  outGeoPath,
  round1,
  worksPath
} from './map-builder/geojson-base.mjs';
import {buildCustomFloor2Plan} from './map-builder/floor-2.mjs';
import {buildCustomFloor1Plan} from './map-builder/floor-1.mjs';
import {buildCustomFloor0Plan} from './map-builder/floor-0.mjs';
import {buildCustomFloorM1Plan} from './map-builder/floor-m1.mjs';
import {buildCustomFloorM2Plan} from './map-builder/floor-m2.mjs';
import {verticalLinks} from './map-builder/vertical-links.mjs';
import {buildAndWriteNavigationGraph} from './map-builder/navigation-graph.mjs';

floorsOutput['2'] = buildCustomFloor2Plan({round1, FLOOR_SUBTITLES, ROOM_ANCHORS});
floorsOutput['1'] = buildCustomFloor1Plan({round1, FLOOR_SUBTITLES, ROOM_ANCHORS});
floorsOutput['0'] = buildCustomFloor0Plan({round1, FLOOR_SUBTITLES, ROOM_ANCHORS});
floorsOutput['-1'] = buildCustomFloorM1Plan({round1, FLOOR_SUBTITLES, ROOM_ANCHORS});
floorsOutput['-2'] = buildCustomFloorM2Plan({round1, FLOOR_SUBTITLES});

const geoData = {
  meta: {
    source: 'OpenStreetMap Louvre indoor GeoJSON (floors -2 to 2)',
    viewBox: {x: 0, y: 0, width: VIEW_W, height: VIEW_H},
    rotationDeg: 19.631,
    generatedAt: '2026-11-22'
  },
  footprintPolys,
  verticalLinks,
  floors: floorsOutput
};

fs.writeFileSync(outGeoPath, `export const floorGeoData = ${JSON.stringify(geoData)};\n`, 'utf8');

const {nodes, edges, artworkCount} = buildAndWriteNavigationGraph({worksPath, navOutPath, ROOM_ANCHORS});

const geoSizeKB = (fs.statSync(outGeoPath).size / 1024).toFixed(1);
console.log(`Built src/floor-map-geo.js (${geoSizeKB} KB) & src/navigation-graph.json (nodes=${nodes.length}, edges=${edges.length}, artworks=${artworkCount})`);
for (const f of FLOORS) {
  const fl = floorsOutput[String(f)];
  console.log(`  Floor ${f}: rooms=${fl.rooms.length}, corridors=${fl.corridors.length}, walls=${fl.walls.length}, doors=${fl.doors.length}, facilities=${fl.facilities.length}, labels=${fl.roomLabels.length}`);
}
