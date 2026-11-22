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
  assert.ok(floor === -2 ? plan.rooms.length >= 2 : plan.rooms.length > 10, `floor ${floor} must contain real architectural room polygons`);
  const markup = floorMapMarkup({floor, floorLabel:String(floor), works, selectedId:null});
  assert.match(markup, /viewBox="0 0 960 600"/, `floor ${floor} needs a stable viewBox`);
  assert.match(markup, /role="img"/, `floor ${floor} needs an image role`);
  for (const layer of layers) {
    assert.ok(markup.includes(`data-layer="${layer}"`), `floor ${floor} is missing ${layer} layer`);
  }
  assert.match(markup, /class="palace-footprint(?:\s|")/, `floor ${floor} must render shared palace footprint`);
  if (floor === -2) {
    assert.match(markup, /is-exhibition/, 'floor -2 must render the light-blue temporary exhibition space');
    assert.match(markup, /企画展/, 'floor -2 must clearly label the light-blue space as 企画展');
  }
  if (floor === -1) {
    assert.match(markup, /class="room-number is-uniform-room"/, 'floor -1 must render all room numbers at a uniform legible size');
    assert.doesNotMatch(markup, /class="room-number is-anchor-room"/, 'floor -1 must not mix different room number font sizes');
    assert.match(markup, /ステュディオ/, 'floor -1 must label the green Studio rest area');
    assert.match(markup, /休憩エリア/, 'floor -1 must indicate Studio is a rest area');
    assert.match(markup, /is-construction/, 'floor -1 must mark construction rooms 180, 181, 179, 175, 174');
    assert.match(markup, /工事中/, 'floor -1 must indicate that the yellow zone is under construction');
    for (const num of ['102', '104', '105', '101', '130', '131', '132', '137', '135', '133', '134', '164', '169', '160', '170', '183', '185', '180', '181', '179', '175', '174']) {
      assert.ok(markup.includes(`>${num}</text>`), `floor -1 must include uniform room label ${num}`);
    }
    assert.equal((markup.match(/data-facility-type="wc"/g) || []).length, 5, 'floor -1 must render all 5 open verified toilets');
    assert.equal((markup.match(/data-facility-type="elevator"/g) || []).length, 11, 'floor -1 must render all 11 open verified elevators');
    assert.equal((markup.match(/data-facility-type="escalator"/g) || []).length, 1, 'floor -1 must render the verified escalator');
    assert.equal((markup.match(/data-facility-type="stairs-down"/g) || []).length, 3, 'floor -1 must render all 3 downward stairs around pyramid');
    assert.equal((markup.match(/data-facility-type="stairs-up"/g) || []).length, 12, 'floor -1 must render all 12 upward stairs');
    assert.equal((markup.match(/data-facility-type="stairs-both"/g) || []).length, 2, 'floor -1 must render all 2 open bidirectional stairs');
    const routedM1 = floorMapMarkup({floor: -1, floorLabel: '−1階', works, selectedId: 'marly', routeWorkIds: ['marly'], viewedIds: []});
    const labelsM1 = [...routedM1.matchAll(/data-room-label="([^"]+)" x="([0-9.]+)" y="([0-9.]+)"/g)]
      .map(m => ({num: m[1], x0: Number(m[2]) - 11, y0: Number(m[3]) - 8, x1: Number(m[2]) + 11, y1: Number(m[3]) + 2}));
    const pinsM1 = [...routedM1.matchAll(/data-pin-kind="([^"]+)" data-pin-pos="([0-9.]+),([0-9.]+)"/g)]
      .map(m => {
        const k = m[1], x = Number(m[2]), y = Number(m[3]);
        if (k === 'dest') return {k, x0: x - 11, y0: y - 31, x1: x + 11, y1: y};
        if (k === 'route') return {k, x0: x - 9, y0: y - 26, x1: x + 9, y1: y};
        if (k === 'viewed') return {k, x0: x - 9.5, y0: y - 15.5, x1: x + 9.5, y1: y + 3.5};
        return {k, x0: x - 5, y0: y - 5, x1: x + 5, y1: y + 5};
      });
    assert.ok(pinsM1.length > 0, 'floor -1 must render artwork pins');
    for (const p of pinsM1) {
      for (const l of labelsM1) {
        const hit = !(p.x1 <= l.x0 || p.x0 >= l.x1 || p.y1 <= l.y0 || p.y0 >= l.y1);
        assert.equal(hit, false, `floor -1 pin (${p.k}) must not overlap room number ${l.num}`);
      }
    }
  }
  if (floor === 0) {
    assert.match(markup, /class="room-number is-uniform-room"/, 'floor 0 must render all room numbers at a uniform legible size');
    assert.doesNotMatch(markup, /class="room-number is-anchor-room"/, 'floor 0 must not mix different room number font sizes');
    assert.match(markup, /is-construction/, 'floor 0 must mark construction rooms 418, 417, 415');
    assert.match(markup, /工事中/, 'floor 0 must clearly indicate that the yellow zone is under construction');
    for (const num of ['212', '218', '206', '201', '200', '219', '226', '227', '230', '229', '236', '231', '305', '308', '300', '312', '316', '317', '321', '327', '328', '348', '345', '339', '338', '337', '347', '403', '406', '408', '400', '402', '405', '418', '419', '415', '417', '410', '413', '424', '422', '427']) {
      assert.ok(markup.includes(`>${num}</text>`), `floor 0 must include uniform room label ${num}`);
    }
    assert.equal((markup.match(/data-facility-type="wc"/g) || []).length, 3, 'floor 0 must render all 3 verified toilets');
    assert.equal((markup.match(/data-facility-type="elevator"/g) || []).length, 15, 'floor 0 must render all 15 open verified elevators');
    assert.equal((markup.match(/data-facility-type="escalator"/g) || []).length, 1, 'floor 0 must render the Richelieu central escalator');
    assert.equal((markup.match(/data-facility-type="stairs-up"/g) || []).length, 5, 'floor 0 must render all 5 upward-only stairs');
    assert.equal((markup.match(/data-facility-type="stairs-down"/g) || []).length, 7, 'floor 0 must render all 7 verified downward stairs');
    assert.equal((markup.match(/data-facility-type="stairs-both"/g) || []).length, 12, 'floor 0 must render all 12 open bidirectional stairs');
    assert.match(markup, /上り階段/, 'floor 0 HUD must label upward stairs');
    assert.match(markup, /下り階段/, 'floor 0 HUD must label downward stairs');
    assert.match(markup, /上下階段/, 'floor 0 HUD must label bidirectional stairs');
    assert.match(markup, /エスカレーター/, 'floor 0 HUD must label escalator');
    const routed0F = floorMapMarkup({floor: 0, floorLabel: '0階', works, selectedId: 'venus', routeWorkIds: ['venus', 'dying'], viewedIds: ['dying']});
    const labels0 = [...routed0F.matchAll(/data-room-label="([^"]+)" x="([0-9.]+)" y="([0-9.]+)"/g)]
      .map(m => ({num: m[1], x0: Number(m[2]) - 11, y0: Number(m[3]) - 8, x1: Number(m[2]) + 11, y1: Number(m[3]) + 2}));
    const pins0 = [...routed0F.matchAll(/data-pin-kind="([^"]+)" data-pin-pos="([0-9.]+),([0-9.]+)"/g)]
      .map(m => {
        const k = m[1], x = Number(m[2]), y = Number(m[3]);
        if (k === 'dest') return {k, x0: x - 11, y0: y - 31, x1: x + 11, y1: y};
        if (k === 'route') return {k, x0: x - 9, y0: y - 26, x1: x + 9, y1: y};
        if (k === 'viewed') return {k, x0: x - 9.5, y0: y - 15.5, x1: x + 9.5, y1: y + 3.5};
        return {k, x0: x - 5, y0: y - 5, x1: x + 5, y1: y + 5};
      });
    assert.ok(pins0.length > 0, 'floor 0 must render artwork pins');
    for (const p of pins0) {
      for (const l of labels0) {
        const hit = !(p.x1 <= l.x0 || p.x0 >= l.x1 || p.y1 <= l.y0 || p.y0 >= l.y1);
        assert.equal(hit, false, `floor 0 pin (${p.k}) must not overlap room number ${l.num}`);
      }
    }
  }
  if (floor === 1) {
    assert.match(markup, /class="room-number is-uniform-room"/, 'floor 1 must render all room numbers at a uniform legible size');
    assert.doesNotMatch(markup, /class="room-number is-anchor-room"/, 'floor 1 must not mix different room number font sizes');
    assert.match(markup, /is-construction/, 'floor 1 must mark construction rooms 564 and 558');
    assert.match(markup, /工事中/, 'floor 1 must clearly indicate that the yellow zone is under construction');
    for (const num of ['564', '558', '552', '557', '548', '544', '535', '505', '503', '500', '507', '517', '516', '531', '519', '528', '606', '605', '601', '600', '617', '632', '635', '636', '640', '663', '660', '661', '650', '656', '652', '641', '651', '700', '701', '702', '703', '715', '711', '709', '706', '705', '716', '712', '710', '708', '717', '718', '719', '726', '720', '734', '727']) {
      assert.ok(markup.includes(`>${num}</text>`), `floor 1 must include uniform room label ${num}`);
    }
    assert.equal((markup.match(/data-facility-type="wc"/g) || []).length, 6, 'floor 1 must render all 6 open verified toilets (excluding under-construction 564)');
    assert.equal((markup.match(/data-facility-type="elevator"/g) || []).length, 10, 'floor 1 must render all 10 verified elevators');
    assert.equal((markup.match(/data-facility-type="escalator"/g) || []).length, 1, 'floor 1 must render the verified escalator');
    assert.equal((markup.match(/data-facility-type="stairs-down"/g) || []).length, 5, 'floor 1 must render all 5 downward-only stairs');
    assert.equal((markup.match(/data-facility-type="stairs-up"/g) || []).length, 1, 'floor 1 must render the verified upward stairs');
    assert.equal((markup.match(/data-facility-type="stairs-both"/g) || []).length, 6, 'floor 1 must render all 6 bidirectional stairs (5 black + Sully SE)');
    assert.equal((markup.match(/data-facility-type="stairs"/g) || []).length, 1, 'floor 1 must render the 1 same-floor inter-room stair (535)');
    assert.match(markup, /下り階段/, 'floor 1 HUD must label downward stairs');
    assert.match(markup, /上り階段/, 'floor 1 HUD must label upward stairs');
    assert.match(markup, /上下階段/, 'floor 1 HUD must label bidirectional stairs');
    assert.match(markup, /同階階段/, 'floor 1 HUD must label same-floor stairs');
    assert.match(markup, /エスカレーター/, 'floor 1 HUD must label escalator');
    assert.equal(floorGeoData.verticalLinks?.length, 34, 'all 34 verified -1F-0F-1F-2F vertical links (13 EV + 1 escalator + 20 stairs) must be recorded');
    const routed1F = floorMapMarkup({floor: 1, floorLabel: '1階', works, selectedId: 'mona', routeWorkIds: ['victory', 'mona', 'liberty', 'scribe'], viewedIds: ['victory']});
    const labels1 = [...routed1F.matchAll(/data-room-label="([^"]+)" x="([0-9.]+)" y="([0-9.]+)"/g)]
      .map(m => ({num: m[1], x0: Number(m[2]) - 11, y0: Number(m[3]) - 8, x1: Number(m[2]) + 11, y1: Number(m[3]) + 2}));
    const pins1 = [...routed1F.matchAll(/data-pin-kind="([^"]+)" data-pin-pos="([0-9.]+),([0-9.]+)"/g)]
      .map(m => {
        const k = m[1], x = Number(m[2]), y = Number(m[3]);
        if (k === 'dest') return {k, x0: x - 11, y0: y - 31, x1: x + 11, y1: y};
        if (k === 'route') return {k, x0: x - 9, y0: y - 26, x1: x + 9, y1: y};
        if (k === 'viewed') return {k, x0: x - 9.5, y0: y - 15.5, x1: x + 9.5, y1: y + 3.5};
        return {k, x0: x - 5, y0: y - 5, x1: x + 5, y1: y + 5};
      });
    assert.ok(pins1.length > 0, 'floor 1 must render artwork pins');
    for (const p of pins1) {
      for (const l of labels1) {
        const hit = !(p.x1 <= l.x0 || p.x0 >= l.x1 || p.y1 <= l.y0 || p.y0 >= l.y1);
        assert.equal(hit, false, `floor 1 pin (${p.k}) must not overlap room number ${l.num}`);
      }
    }
  }
  if (floor === 2) {
    assert.doesNotMatch(markup, /ドゥノン翼/, 'floor 2 must not label Denon wing since Denon has no 2nd floor');
    assert.match(markup, /class="room-number is-uniform-room"/, 'floor 2 must render all room numbers at a uniform legible size');
    assert.doesNotMatch(markup, /class="room-number is-anchor-room"/, 'floor 2 must not mix different room number font sizes');
    for (const num of ['864', '848', '855', '845', '843', '836', '802', '801', '800', '803', '814', '825', '823', '818', '835', '830', '909', '912', '913', '902', '900', '952', '944', '940', '936', '931', '917', '924']) {
      assert.ok(markup.includes(`>${num}</text>`), `floor 2 must include uniform room label ${num}`);
    }
    assert.equal((markup.match(/data-facility-type="wc"/g) || []).length, 5, 'floor 2 must render all 5 verified toilets');
    assert.equal((markup.match(/data-facility-type="elevator"/g) || []).length, 5, 'floor 2 must render all 5 verified elevators');
    assert.equal((markup.match(/data-facility-type="stairs-down"/g) || []).length, 7, 'floor 2 must render all 7 verified downward stairs');
    assert.equal((markup.match(/data-facility-type="escalator"/g) || []).length, 1, 'floor 2 must render the verified escalator');
    assert.match(markup, /下り階段/, 'floor 2 HUD must label downward stairs');
    assert.match(markup, /エスカレーター/, 'floor 2 HUD must label escalator');
    // Verify artwork pins NEVER overlap room number bounding boxes on Floor 2
    const routed2F = floorMapMarkup({floor: 2, floorLabel: '2階', works, selectedId: 'lacemaker', routeWorkIds: ['lacemaker', 'money', 'cheat', 'bather'], viewedIds: ['money']});
    const labels = [...routed2F.matchAll(/data-room-label="([^"]+)" x="([0-9.]+)" y="([0-9.]+)"/g)]
      .map(m => ({num: m[1], x0: Number(m[2]) - 11, y0: Number(m[3]) - 8, x1: Number(m[2]) + 11, y1: Number(m[3]) + 2}));
    const pins = [...routed2F.matchAll(/data-pin-kind="([^"]+)" data-pin-pos="([0-9.]+),([0-9.]+)"/g)]
      .map(m => {
        const k = m[1], x = Number(m[2]), y = Number(m[3]);
        if (k === 'dest') return {k, x0: x - 11, y0: y - 31, x1: x + 11, y1: y};
        if (k === 'route') return {k, x0: x - 9, y0: y - 26, x1: x + 9, y1: y};
        if (k === 'viewed') return {k, x0: x - 9.5, y0: y - 15.5, x1: x + 9.5, y1: y + 3.5};
        return {k, x0: x - 5, y0: y - 5, x1: x + 5, y1: y + 5};
      });
    assert.ok(pins.length > 0, 'floor 2 must render artwork pins');
    for (const p of pins) {
      for (const l of labels) {
        const hit = !(p.x1 <= l.x0 || p.x0 >= l.x1 || p.y1 <= l.y0 || p.y0 >= l.y1);
        assert.equal(hit, false, `floor 2 pin (${p.k}) must not overlap room number ${l.num}`);
      }
    }
  }
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

const wcPickFloor = floorMapMarkup({floor:2, floorLabel:'2階', works, selectedId:null, facilityFilter:'wc'});
assert.match(wcPickFloor, /facility-pick-mode/, 'facility pickup mode should activate on SVG');
assert.match(wcPickFloor, /pick-wc/, 'toilet pickup mode should highlight WC markers');
assert.match(wcPickFloor, /is-picked/, 'matching facility markers must be marked as picked');

const cafePickFloor = floorMapMarkup({floor:2, floorLabel:'2階', works, selectedId:null, facilityFilter:'cafe'});
assert.match(cafePickFloor, /facility-pick-mode/, 'cafe pickup mode should activate on SVG');

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
