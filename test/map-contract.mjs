import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {floorMapMarkup} from '../src/floor-map.js';
import {floorGeoData} from '../src/floor-map-geo.js';
import {buildNavigationView, indexNavigationGraph, navigationStateForSelection, navigationStateFromRoute} from '../src/navigation.js';
import {advanceOnRouteAudio} from '../src/route-progress.js';

const works = JSON.parse(await readFile(new URL('../src/works.json', import.meta.url), 'utf8'));
const navigationGraph = JSON.parse(await readFile(new URL('../src/navigation-graph.json', import.meta.url), 'utf8'));
const navigationIndex = indexNavigationGraph(navigationGraph);
const layers = ['wings', 'rooms', 'corridors', 'connections', 'doors', 'facilities', 'artworks', 'labels', 'alerts', 'route'];

assert.ok(floorGeoData.footprintPolys.length > 50, 'shared palace footprint polygons must be built from GeoJSON');

for (const floor of [2, 1, 0, -1, -2]) {
  const plan = floorGeoData.floors[String(floor)];
  assert.ok(plan, `floor ${floor} GeoJSON plan must exist`);
  assert.ok(plan.rooms.length > 10, `floor ${floor} must contain real architectural room polygons`);
  const markup = floorMapMarkup({floor, floorLabel:String(floor), works, selectedId:null});
  assert.match(markup, /viewBox="0 0 960 600"/, `floor ${floor} needs a stable viewBox`);
  assert.match(markup, /role="img"/, `floor ${floor} needs an image role`);
  for (const layer of layers) {
    assert.ok(markup.includes(`data-layer="${layer}"`), `floor ${floor} is missing ${layer} layer`);
  }
  assert.match(markup, /class="palace-footprint"/, `floor ${floor} must render shared palace footprint`);
  if (floor === 2) assert.doesNotMatch(markup, /ドゥノン翼/, 'floor 2 must not label Denon wing since Denon has no 2nd floor');
  assert.doesNotMatch(markup, /class="map-heading"/, `floor ${floor} must place floor info inside SVG top-left instead of a separate header bar`);
  assert.doesNotMatch(markup, /class="facility-label|class="map-label|class="wing-range/, `floor ${floor} must keep map interior text minimal without cluttering labels`);
  const hudMatch = markup.match(/data-hud-bounds="([0-9.]+),([0-9.]+),([0-9.]+),([0-9.]+)"/);
  assert.ok(hudMatch, `floor ${floor} must render top-left SVG map HUD`);
  const [hx, hy, hw, hh] = hudMatch.slice(1).map(Number);
  assert.ok(hx + hw <= 202 && hy + hh <= 440, `floor ${floor} HUD (${hx},${hy},${hw}x${hh}) must stay inside the empty top-left void`);
  for (const poly of floorGeoData.footprintPolys) {
    for (const pt of poly.split(' ')) {
      const [px, py] = pt.split(',').map(Number);
      assert.equal(px >= hx && px <= hx + hw && py >= hy && py <= hy + hh, false, `floor ${floor} HUD must never overlap palace geometry`);
    }
  }
  assert.doesNotMatch(markup, /route-arrow|marker-end|pin-number/, `floor ${floor} must not render a dummy route`);
  assert.doesNotMatch(markup, /概略|検証用/, `floor ${floor} must not retain legacy schematic copy`);
}

const firstFloor = floorMapMarkup({floor:1, floorLabel:'1階', works, selectedId:'mona'});
assert.match(firstFloor, /data-map-work="mona"/, 'verified artwork room marker should render');
assert.match(firstFloor, /class="artwork-pin\b/, 'artwork markers must render');
assert.match(firstFloor, /class="artwork-pin-core/, 'artwork markers need a high-contrast center');
assert.match(firstFloor, /pin-dest/, 'destination pin should use teardrop destination style');
assert.match(firstFloor, /room-node is-selected/, 'selected artwork room should use a non-colour outline state');

const viewedFloor = floorMapMarkup({floor:1, floorLabel:'1階', works, selectedId:'mona', routeWorkIds:['victory','mona','liberty'], viewedIds:['victory']});
assert.match(viewedFloor, /pin-viewed/, 'viewed route stop must render green viewed pin');
assert.match(viewedFloor, /pin-check/, 'viewed route stop must render checkmark');
assert.match(viewedFloor, /pin-route/, 'unvisited route stop must render blue route pin');

const wcPickFloor = floorMapMarkup({floor:-2, floorLabel:'−2階', works, selectedId:null, facilityFilter:'wc'});
assert.match(wcPickFloor, /facility-pick-mode/, 'facility pickup mode should activate on SVG');
assert.match(wcPickFloor, /pick-wc/, 'toilet pickup mode should highlight WC markers');
assert.match(wcPickFloor, /is-picked/, 'matching facility markers must be marked as picked');

const cafePickFloor = floorMapMarkup({floor:-2, floorLabel:'−2階', works, selectedId:null, facilityFilter:'cafe'});
assert.match(cafePickFloor, /pick-cafe/, 'cafe pickup mode should highlight cafe markers');

const warningFloor = floorMapMarkup({floor:1, floorLabel:'1階', works, selectedId:null, roomNotices:[{floor:1,room:'711',label:'重要情報'}]});
assert.match(warningFloor, /class="room-alert"/, 'a room-specific warning can render without adding a global map overlay');

const navigation = buildNavigationView(navigationIndex, {journeyStartNodeId:'work:victory', currentNodeId:'door:f1:703', destinationNodeId:'work:venus'});
const routedFloor = floorMapMarkup({floor:1, floorLabel:'1階', works, selectedId:'venus', navigation});
const destinationFloor = floorMapMarkup({floor:0, floorLabel:'地上階', works, selectedId:'venus', navigation});
assert.match(routedFloor, /class="route-active"/, 'active route should render');
assert.match(routedFloor, /class="route-passed"/, 'passed route should render');
assert.match(routedFloor, /class="floor-transition is-leaving"/, 'floor transition should render');
assert.match(routedFloor, /最後に確認した地点/, 'explicit non-GPS location label should render');
assert.match(destinationFloor, /class="route-destination"/, 'next artwork should render above the route line on its floor');

const routeIds = ['victory','mona','liberty'];
const initialProgress = navigationStateFromRoute(navigationIndex, routeIds);
const initialNavigation = buildNavigationView(navigationIndex, initialProgress);
const entranceFloor = floorMapMarkup({floor:-2, floorLabel:'−2階', works, selectedId:'victory', navigation:initialNavigation});
assert.match(entranceFloor, /class="route-active"/, 'entrance to first work must be the active route');
const initialFirstFloor = floorMapMarkup({floor:1, floorLabel:'1階', works, selectedId:'victory', navigation:initialNavigation});
assert.doesNotMatch(initialFirstFloor, /class="route-planned"/, 'future pale-blue route lines must not clutter the map');
assert.match(initialFirstFloor, /次の目的地/, 'the next destination must be visually identified');

const selectedSecondNavigation = buildNavigationView(navigationIndex, navigationStateForSelection(navigationIndex, routeIds, 'mona'));
const selectedSecondFloor = floorMapMarkup({floor:1, floorLabel:'1階', works, selectedId:'mona', navigation:selectedSecondNavigation});
assert.match(selectedSecondFloor, /区間の開始地点/, 'selected leg must label its previous work as the start');
assert.match(selectedSecondFloor, /class="route-passed"/, 'legs before the selected work must be dotted');
assert.match(selectedSecondFloor, /class="route-active"/, 'the selected work leg must be emphasized');
assert.doesNotMatch(selectedSecondFloor, /class="route-planned"/, 'legs after the selected work must not draw pale-blue lines');

const victoryProgress = advanceOnRouteAudio(navigationIndex, initialProgress, routeIds, 'victory').navigation;
const arrivedProgress = advanceOnRouteAudio(navigationIndex, victoryProgress, routeIds, 'mona').navigation;
const arrivedNavigation = buildNavigationView(navigationIndex, arrivedProgress);
const arrivedFloor = floorMapMarkup({floor:1, floorLabel:'1階', works, selectedId:'liberty', navigation:arrivedNavigation});
assert.match(arrivedFloor, /推定現在地/, 'audio arrival should change the location label');
assert.match(arrivedFloor, /class="route-passed"/, 'arrived leg should remain as a dotted route');
assert.match(arrivedFloor, /class="route-active"/, 'the newly calculated next leg should render');

console.log('floor map contract: passed');
