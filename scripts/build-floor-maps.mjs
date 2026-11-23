import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const geoDir = path.join(root, 'data/geojson');
const outGeoPath = path.join(root, 'src/floor-map-geo.js');
const worksPath = path.join(root, 'src/works.json');
const navOutPath = path.join(root, 'src/navigation-graph.json');

const FLOORS = [-2, -1, 0, 1, 2];
const FLOOR_SUBTITLES = {
  2: '絵画展示階（北ヨーロッパ・フランス）',
  1: '絵画・装飾美術・古代エジプト',
  0: '古代彫刻・オリエント・ミロのヴィーナス',
  '-1': '彫刻中庭・イスラム美術・中世ルーヴル',
  '-2': 'ナポレオン・ホール（ピラミッド中央入口・受付）'
};

// Rotation aligns Grande Galerie & Rue de Rivoli horizontally (north at top)
const COS_LAT = Math.cos(48.861 * Math.PI / 180);
const ROT_RAD = 19.631 * Math.PI / 180;
const COS_R = Math.cos(ROT_RAD);
const SIN_R = Math.sin(ROT_RAD);

const rot = ([lon, lat]) => {
  const x0 = lon * COS_LAT;
  const y0 = lat;
  return [x0 * COS_R - y0 * SIN_R, x0 * SIN_R + y0 * COS_R];
};

// Exclude off-site street POIs (Samaritaine, Place Colette, Palais Royal shops)
const inPalace = ([x, y]) => x >= -14.9705 && x <= -14.9652 && y >= 46.5359 && y <= 46.53898;

const rawFloors = Object.fromEntries(
  FLOORS.map(f => [f, JSON.parse(fs.readFileSync(path.join(geoDir, `floor-${f}.geojson`), 'utf8'))])
);

// Compute unified bounding box across all 5 floors' palace polygons
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (const g of Object.values(rawFloors)) {
  for (const ft of g.features || []) {
    if (ft.geometry?.type !== 'Polygon') continue;
    const pts = ft.geometry.coordinates[0].map(rot);
    if (!pts.every(inPalace)) continue;
    for (const [x, y] of pts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

const PAD_X = 28;
const PAD_Y = 38;
const VIEW_W = 960;
const VIEW_H = 600;
const SCALE = Math.min((VIEW_W - PAD_X * 2) / (maxX - minX), (VIEW_H - PAD_Y * 2) / (maxY - minY));
const OFF_X = PAD_X + ((VIEW_W - PAD_X * 2) - (maxX - minX) * SCALE) / 2;
const OFF_Y = PAD_Y + ((VIEW_H - PAD_Y * 2) - (maxY - minY) * SCALE) / 2;

const round1 = n => Math.round(n * 10) / 10;
const proj = pt => {
  const [x, y] = rot(pt);
  return [round1(OFF_X + (x - minX) * SCALE), round1(OFF_Y + (maxY - y) * SCALE)];
};

function ringArea(pts) {
  let sum = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    sum += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  }
  return Math.abs(sum) / 2;
}

function ringCentroid(pts) {
  const n = pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1] ? pts.length - 1 : pts.length;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i += 1) { sx += pts[i][0]; sy += pts[i][1]; }
  return [round1(sx / n), round1(sy / n)];
}

function simplifyRing(pts) {
  const out = [];
  for (const pt of pts) {
    const prev = out.at(-1);
    if (!prev || Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) >= 0.9) {
      out.push(pt);
    }
  }
  if (out.length > 2 && Math.hypot(out[0][0] - out.at(-1)[0], out[0][1] - out.at(-1)[1]) < 0.9) {
    out.pop();
  }
  return out;
}

const FLOOR_ROOM_RANGE = {
  '-1': [100, 199],
  '0': [200, 499],
  '1': [500, 799],
  '2': [800, 999]
};

function isValidRoomForFloor(roomNum, floor) {
  const band = FLOOR_ROOM_RANGE[String(floor)];
  if (!band) return false;
  const n = Number(roomNum);
  return Number.isFinite(n) && n >= band[0] && n <= band[1];
}

function extractRoomNumber(props, floor) {
  const candidates = [props.ref, props.alt_name, props.name];
  for (const text of candidates) {
    if (!text) continue;
    const str = String(text);
    if (/^(E|N|INV|MR|RF)\s+\d+/i.test(str)) continue;
    const exact = str.match(/^(?:Salle\s*)?([1-9]\d{2})(?:\b|;)/i);
    if (exact && isValidRoomForFloor(exact[1], floor)) return exact[1];
    const salle = str.match(/Salle\s+([1-9]\d{2})\b/i);
    if (salle && isValidRoomForFloor(salle[1], floor)) return salle[1];
  }
  if (floor === 1 && /Daru,\s*néoclassicisme/i.test(props.name || '')) return '702';
  if (floor === 0 && /Vénus de Milo/i.test(props.name || '')) return '345';
  if (floor === 1 && /Salle des États/i.test(props.name || '')) return '711';
  if (floor === 1 && /Mollien,\s*romantisme/i.test(props.name || '')) return '700';
  if (floor === 1 && /Grande Galerie/i.test(props.name || '')) return '710';
  if (floor === 1 && /Salvator Rosa/i.test(props.name || '')) return '718';
  if (floor === 1 && /Salon théâtre|Grande Salle à manger/i.test(props.name || '')) return '544';
  if (floor === 0 && /Cour du Sphinx/i.test(props.name || '')) return '338';
  return null;
}

function inferWing(floor, roomNum, [cx, cy]) {
  if (floor === -2) return 'central';
  if (roomNum) {
    const n = Number(roomNum);
    if ((n >= 100 && n < 130) || (n >= 200 && n < 300) || (n >= 500 && n < 600) || (n >= 800 && n < 900)) return 'richelieu';
    if ((n >= 130 && n < 160) || (n >= 300 && n < 400) || (n >= 600 && n < 700) || (n >= 900 && n < 1000)) return 'sully';
    if ((n >= 160 && n < 200) || (n >= 400 && n < 500) || (n >= 700 && n < 800)) return 'denon';
  }
  if (cx >= 645) return 'sully';
  if (cy >= 380) return 'denon';
  if (cy <= 265) return 'richelieu';
  return 'central';
}

function classifyFacility(props) {
  if (props.amenity === 'toilets') return {type: 'wc', label: ''};
  if (props.amenity === 'cafe' || props.amenity === 'restaurant' || props.amenity === 'fast_food') {
    const rawName = props.name || '';
    const shortName = rawName.length > 14 ? rawName.slice(0, 14) : rawName;
    return {type: 'cafe', label: shortName || 'カフェ'};
  }
  if (props.conveying) return {type: 'escalator', label: ''};
  if (props.elevator === 'yes' || props.highway === 'elevator') return {type: 'elevator', label: ''};
  if (props.stairs === 'yes' || props.highway === 'steps' || props.indoor === 'stairs') return {type: 'stairs', label: ''};
  if (props.information || /Assistance/i.test(props.name || '')) return {type: 'information', label: '案内所'};
  if (/Vestiaire|Cloakroom/i.test((props.name || '') + (props['name:en'] || ''))) return {type: 'cloak', label: 'クローク'};
  if (props.shop === 'ticket') return {type: 'ticket', label: 'チケット'};
  if (props.room === 'auditorium' || /Auditorium/i.test(props.name || '')) return {type: 'auditorium', label: 'オーディトリアム'};
  if (/Amis du Louvre/i.test(props.name || '')) return {type: 'friends', label: '友の会'};
  return null;
}

// Canonical room anchor positions verified against the projected OSM GeoJSON polygons
const ROOM_ANCHORS = {
  '-1': {
    // Coordinates mapped directly from the user's exact -1F architectural PPT plan (1024x506 -> 960x600)
    '102': {x: 514.7, y: 171.8, wing: 'richelieu', name: 'マルリーの中庭'},
    '105': {x: 626.1, y: 170.7, wing: 'richelieu', name: 'ピュジェの中庭'},
    '169': {x: 481.3, y: 414.8, wing: 'denon', name: '彫刻展示室'},
    '170': {x: 615.4, y: 372.2, wing: 'denon', name: '先古典期ギリシア'}
  },
  '0': {
    // Coordinates mapped directly from the user's exact 0F architectural PPT plan (1024x429 -> 960x600)
    '227': {x: 696.4, y: 127.1, wing: 'richelieu', name: 'ハンムラビ法典の間'},
    '229': {x: 704.4, y: 158.3, wing: 'richelieu', name: 'コルサバードの中庭'},
    '234': {x: 695.1, y: 225.1, wing: 'richelieu', name: 'メソポタミア'},
    '338': {x: 858.5, y: 360.9, wing: 'sully', name: 'スフィンクスの地下室'},
    '344': {x: 829.1, y: 364.1, wing: 'sully', name: 'ギリシア古典彫刻'},
    '345': {x: 795.7, y: 364.1, wing: 'sully', name: 'ミロのヴィーナスの間'},
    '348': {x: 795.7, y: 332.9, wing: 'sully', name: 'カリアティードの間'},
    '403': {x: 520.1, y: 369.8, wing: 'denon', name: 'ミケランジェロ・ギャラリー'},
    // Added 2026-11-23: rooms already drawn on the PPT plan; pin = centre of the drawn room shape
    '300': {x: 795.7, y: 260.3, wing: 'sully', name: '300室'},
    '321': {x: 916.0, y: 276.8, wing: 'sully', name: '321室'}
  },
  '1': {
    // Coordinates mapped directly from the user's exact 1F architectural PPT plan (1024x429 -> 960x600)
    '501': {x: 589.1, y: 174.0, wing: 'richelieu', name: 'シャルルマーニュの間'},
    '502': {x: 589.1, y: 164.0, wing: 'richelieu', name: 'シュジェールの間'},
    '507': {x: 636.4, y: 133.4, wing: 'richelieu', name: 'マクシミリアンの狩猟ギャラリー'},
    '544': {x: 488.9, y: 219.8, wing: 'richelieu', name: 'ナポレオン三世の居室'},
    '605': {x: 805.9, y: 237.6, wing: 'sully', name: '18世紀装飾美術'},
    '635': {x: 916.0, y: 280.3, wing: 'sully', name: '古代エジプト美術'},
    '663': {x: 795.7, y: 335.6, wing: 'sully', name: 'ブロンズの間'},
    '700': {x: 520.1, y: 369.4, wing: 'denon', name: 'モリアン室'},
    '701': {x: 557.5, y: 368.1, wing: 'denon', name: 'ドゥノン室'},
    '702': {x: 605.1, y: 369.0, wing: 'denon', name: 'ダリュ室'},
    '703': {x: 703.1, y: 366.7, wing: 'denon', name: 'ダリュの階段踊り場'},
    '708': {x: 681.7, y: 474.5, wing: 'denon', name: 'サロン・カレ'},
    '710': {x: 602.9, y: 474.5, wing: 'denon', name: 'グラン・ギャラリー東'},
    '711': {x: 557.5, y: 423.3, wing: 'denon', name: '諸国の間'},
    '712': {x: 511.6, y: 474.5, wing: 'denon', name: 'グラン・ギャラリー中央'},
    '716': {x: 342.4, y: 474.5, wing: 'denon', name: 'グラン・ギャラリー西'},
    '718': {x: 154.5, y: 450.0, wing: 'denon', name: 'スペイン絵画'},
    // Added 2026-11-23: rooms already drawn on the PPT plan; pin = centre of the drawn room shape
    '505': {x: 589.1, y: 134.7, wing: 'richelieu', name: '505室'},
    '617': {x: 852.3, y: 237.1, wing: 'sully', name: '617室'},
    '633': {x: 916.0, y: 259.9, wing: 'sully', name: '633室'},
    '636': {x: 917.3, y: 307.9, wing: 'sully', name: '636室'},
    '640': {x: 916.0, y: 334.7, wing: 'sully', name: '640室'},
    '641': {x: 892.8, y: 355.1, wing: 'sully', name: '641室'}
  },
  '2': {
    // Coordinates mapped directly from the user's exact 2F architectural PPT plan (1024x429 -> 960x600)
    '801': {x: 587.6, y: 171.2, wing: 'richelieu', name: 'メディシス・ギャラリー'},
    '814': {x: 663.9, y: 132.9, wing: 'richelieu', name: '北方ルネサンス'},
    '818': {x: 682.6, y: 189.5, wing: 'richelieu', name: 'フランドル絵画'},
    '824': {x: 680.5, y: 132.9, wing: 'richelieu', name: 'フォンテーヌブロー派'},
    '825': {x: 696.4, y: 132.9, wing: 'richelieu', name: 'プッサンの間'},
    '837': {x: 545.1, y: 213.1, wing: 'richelieu', name: 'フェルメールの間'},
    '844': {x: 492.0, y: 182.0, wing: 'richelieu', name: 'レンブラントの間'},
    '912': {x: 804.6, y: 237.1, wing: 'sully', name: '17世紀フランス絵画'},
    '917': {x: 915.1, y: 264.0, wing: 'sully', name: '18世紀フランス絵画'},
    '919': {x: 915.1, y: 282.0, wing: 'sully', name: 'ルイ15世時代の絵画'},
    '929': {x: 915.1, y: 349.8, wing: 'sully', name: 'フラゴナールの間'},
    '931': {x: 893.3, y: 365.4, wing: 'sully', name: 'ロココ絵画'},
    '940': {x: 830.5, y: 365.4, wing: 'sully', name: 'アングルの間'}
  }
};

// Official Louvre floor-map landmark room numbers so every wing is easy to orient
const OFFICIAL_ROOM_LABELS = {
  '-1': [
    {number: '101', x: 460, y: 196},
    {number: '130', x: 676, y: 312},
    {number: '132', x: 718, y: 344},
    {number: '133', x: 776, y: 346},
    {number: '135', x: 742, y: 368},
    {number: '160', x: 432, y: 438},
    {number: '185', x: 562, y: 466}
  ],
  '0': [
    {number: '200', x: 462, y: 196},
    {number: '201', x: 462, y: 162},
    {number: '212', x: 376, y: 132},
    {number: '218', x: 405, y: 112},
    {number: '230', x: 622, y: 168},
    {number: '236', x: 564, y: 202},
    {number: '300', x: 678, y: 208},
    {number: '308', x: 734, y: 204},
    {number: '316', x: 842, y: 204},
    {number: '321', x: 907, y: 274},
    {number: '328', x: 907, y: 378},
    {number: '337', x: 858, y: 432},
    {number: '400', x: 404, y: 432},
    {number: '405', x: 460, y: 478},
    {number: '406', x: 520, y: 434},
    {number: '410', x: 618, y: 452},
    {number: '419', x: 598, y: 492},
    {number: '427', x: 112, y: 498}
  ],
  '1': [
    {number: '500', x: 462, y: 196},
    {number: '517', x: 582, y: 120},
    {number: '531', x: 540, y: 200},
    {number: '535', x: 422, y: 200},
    {number: '548', x: 344, y: 136},
    {number: '552', x: 382, y: 108},
    {number: '600', x: 678, y: 300},
    {number: '617', x: 762, y: 202},
    {number: '632', x: 866, y: 202},
    {number: '640', x: 907, y: 374},
    {number: '651', x: 868, y: 434},
    {number: '656', x: 786, y: 434},
    {number: '660', x: 724, y: 434},
    {number: '705', x: 634, y: 498},
    {number: '709', x: 566, y: 486},
    {number: '715', x: 342, y: 486}
  ],
  '2': [
    {number: '800', x: 462, y: 196},
    {number: '802', x: 462, y: 112},
    {number: '822', x: 540, y: 114},
    {number: '835', x: 530, y: 196},
    {number: '848', x: 368, y: 112},
    {number: '864', x: 318, y: 90},
    {number: '900', x: 676, y: 308},
    {number: '902', x: 676, y: 256},
    {number: '909', x: 678, y: 204},
    {number: '924', x: 907, y: 316},
    {number: '936', x: 834, y: 428},
    {number: '944', x: 716, y: 428},
    {number: '952', x: 676, y: 374}
  ]
};

// Build shared palace footprint base from major polygons across floors 0, 1, 2
const footprintPolys = [];
for (const f of [0, 1, 2]) {
  for (const ft of rawFloors[f].features || []) {
    if (ft.geometry?.type !== 'Polygon') continue;
    const pr = ft.properties || {};
    if (pr.indoor === 'glass_cabinet' || /Vitrine/i.test(pr.name || '')) continue;
    const rawPts = ft.geometry.coordinates[0];
    if (!rawPts.map(rot).every(inPalace)) continue;
    const pts = simplifyRing(rawPts.map(proj));
    if (pts.length < 3 || ringArea(pts) < 40) continue;
    footprintPolys.push(pts.map(p => `${p[0]},${p[1]}`).join(' '));
  }
}

const floorsOutput = {};

for (const floor of FLOORS) {
  const g = rawFloors[floor];
  const rooms = [];
  const corridors = [];
  const walls = [];
  const doors = [];
  const facilities = [];
  const usedFacilityBuckets = new Set();

  for (const ft of g.features || []) {
    const pr = ft.properties || {};
    const gt = ft.geometry?.type;
    if (pr.indoor === 'glass_cabinet' || /Vitrine/i.test(pr.name || '')) continue;

    if (gt === 'Polygon') {
      const rawPts = ft.geometry.coordinates[0];
      if (!rawPts.map(rot).every(inPalace)) continue;
      const pts = simplifyRing(rawPts.map(proj));
      if (pts.length < 3) continue;
      const area = ringArea(pts);
      if (area < 6) continue;
      const [cx, cy] = ringCentroid(pts);
      const fac = classifyFacility(pr);
      if (fac && (pr.highway === 'elevator' || pr.elevator === 'yes' || pr.stairs === 'yes' || pr.indoor === 'stairs' || pr.conveying || pr.amenity === 'toilets')) {
        const bKey = `${fac.type}:${Math.round(cx / 18)}:${Math.round(cy / 18)}`;
        if (!usedFacilityBuckets.has(bKey)) {
          usedFacilityBuckets.add(bKey);
          facilities.push({type: fac.type, x: Math.round(cx), y: Math.round(cy), label: fac.label});
        }
        if (area < 120) continue;
      } else if (fac && fac.label) {
        const bKey = `${fac.type}:${Math.round(cx / 28)}:${Math.round(cy / 28)}`;
        if (!usedFacilityBuckets.has(bKey)) {
          usedFacilityBuckets.add(bKey);
          facilities.push({type: fac.type, x: Math.round(cx), y: Math.round(cy), label: fac.label});
        }
      }

      const pointsStr = pts.map(p => `${p[0]},${p[1]}`).join(' ');
      const isMedievalLouvreGallery = floor === -1 && cx >= 680 && cx <= 810 && cy >= 300 && cy <= 415;
      if (pr.indoor === 'corridor' && !isMedievalLouvreGallery) {
        corridors.push({points: pointsStr, cx, cy, area: Math.round(area)});
      } else {
        const number = extractRoomNumber(pr, floor);
        const wing = isMedievalLouvreGallery ? 'sully' : inferWing(floor, number, [cx, cy]);
        rooms.push({
          points: pointsStr,
          number: number || '',
          wing,
          cx,
          cy,
          area: Math.round(area),
          name: pr.name || ''
        });
      }
    } else if (gt === 'LineString') {
      const rawPts = ft.geometry.coordinates;
      if (!rawPts.map(rot).every(inPalace)) continue;
      const pts = simplifyRing(rawPts.map(proj));
      if (pts.length < 2) continue;
      if (pr.indoor === 'wall') {
        walls.push(pts.map(p => `${p[0]},${p[1]}`).join(' '));
      } else if (pr.conveying || pr.highway === 'steps') {
        const mid = pts[Math.floor(pts.length / 2)];
        const type = pr.conveying ? 'escalator' : 'stairs';
        const bKey = `${type}:${Math.round(mid[0] / 22)}:${Math.round(mid[1] / 22)}`;
        if (!usedFacilityBuckets.has(bKey)) {
          usedFacilityBuckets.add(bKey);
          facilities.push({type, x: Math.round(mid[0]), y: Math.round(mid[1]), label: ''});
        }
      }
    } else if (gt === 'Point') {
      if (!inPalace(rot(ft.geometry.coordinates))) continue;
      const [x, y] = proj(ft.geometry.coordinates);
      if (pr.door) {
        doors.push([Math.round(x), Math.round(y)]);
      } else {
        const fac = classifyFacility(pr);
        if (fac) {
          const bKey = `${fac.type}:${Math.round(x / 20)}:${Math.round(y / 20)}`;
          if (!usedFacilityBuckets.has(bKey)) {
            usedFacilityBuckets.add(bKey);
            facilities.push({type: fac.type, x: Math.round(x), y: Math.round(y), label: fac.label});
          }
        }
      }
    }
  }

  // Deduplicate room labels so numbers stay crisp & legible
  const placedLabels = [];
  const roomLabels = [];
  const seenLabelNums = new Set();
  const anchors = ROOM_ANCHORS[String(floor)] || {};
  for (const [num, info] of Object.entries(anchors)) {
    seenLabelNums.add(num);
    placedLabels.push([info.x, info.y]);
    roomLabels.push({number: num, x: info.x, y: info.y, priority: true});
  }
  for (const item of OFFICIAL_ROOM_LABELS[String(floor)] || []) {
    if (seenLabelNums.has(item.number)) continue;
    if (placedLabels.some(([px, py]) => Math.hypot(px - item.x, py - item.y) < 22)) continue;
    seenLabelNums.add(item.number);
    placedLabels.push([item.x, item.y]);
    roomLabels.push({number: item.number, x: item.x, y: item.y, priority: false});
  }
  const numberedPolys = rooms.filter(r => r.number && !seenLabelNums.has(r.number)).sort((a, b) => b.area - a.area);
  for (const r of numberedPolys) {
    if (r.area < 120) continue;
    if (placedLabels.some(([px, py]) => Math.hypot(px - r.cx, py - r.cy) < 26)) continue;
    seenLabelNums.add(r.number);
    placedLabels.push([r.cx, r.cy]);
    roomLabels.push({number: r.number, x: Math.round(r.cx), y: Math.round(r.cy), priority: false});
  }

  const wings = floor === -2
    ? [
        {id: 'central', label: 'Hall Napoléon（ピラミッド中央入口）', range: '受付・チケット・クローク', labelX: 445, labelY: 208},
        {id: 'richelieu', label: 'リシュリュー翼方面', range: '', labelX: 430, labelY: 112},
        {id: 'sully', label: 'シュリー翼方面', range: '', labelX: 745, labelY: 315},
        {id: 'denon', label: 'ドゥノン翼方面', range: '', labelX: 465, labelY: 562}
      ]
    : [
        {id: 'richelieu', label: 'リシュリュー翼', range: floor === 2 ? '800–864室' : floor === 1 ? '500–564室' : floor === 0 ? '200–236室' : '100–106室', labelX: 370, labelY: 42},
        {id: 'sully', label: 'シュリー翼（クール・カレ）', range: floor === 2 ? '900–952室' : floor === 1 ? '600–663室' : floor === 0 ? '300–348室' : '130–137室', labelX: 720, labelY: 42},
        {id: 'denon', label: 'ドゥノン翼', range: floor === 2 ? '（2階展示室なし）' : floor === 1 ? '700–734室' : floor === 0 ? '400–433室' : '160–187室', labelX: 250, labelY: 576}
      ];

  const labels = floor === -2
    ? [
        {x: 441, y: 312, text: 'ピラミッド中央入口'},
        {x: 495, y: 494, text: 'イスラム美術'}
      ]
    : [
        {x: 495, y: 316, text: 'ナポレオン中庭（ピラミッド）'},
        {x: 792, y: 312, text: 'クール・カレ（方形中庭）'}
      ];

  floorsOutput[String(floor)] = {
    subtitle: FLOOR_SUBTITLES[floor],
    wings,
    labels,
    rooms,
    corridors,
    walls,
    doors: doors.slice(0, 140),
    facilities: facilities.slice(0, 48),
    roomLabels,
    roomAnchors: anchors
  };
}

// Backfill OSM-missing gallery room polygons from sibling floors strictly inside
// official Louvre public gallery extents (verified against official Louvre floor maps).
const BACKFILL_RULES = {
  '2': {
    sources: ['1', '0'],
    minDist: 10,
    // Official Floor 2 Sully loop (rooms 900–952); Denon & far-west Richelieu have NO 2F galleries
    match: (cx, cy) => cx >= 652 && cy >= 170 && cy <= 455
  },
  '1': {
    sources: ['2', '0'],
    minDist: 16,
    // Official Floor 1 Richelieu (500–564), Sully (600–663), and Denon West (717–734)
    match: (cx, cy) =>
      (cx >= 225 && cx <= 648 && cy >= 65 && cy <= 220) ||
      (cx >= 652 && cy >= 170 && cy <= 455) ||
      (cx >= 100 && cx <= 210 && cy >= 475 && cy <= 545)
  },
  '0': {
    sources: ['1', '2'],
    minDist: 16,
    // Official Floor 0 Richelieu (200–236), Sully (300–348), Denon central/east (400–419)
    match: (cx, cy) =>
      (cx >= 340 && cx <= 648 && cy >= 100 && cy <= 220) ||
      (cx >= 652 && cy >= 170 && cy <= 455) ||
      (cx >= 380 && cx <= 648 && cy >= 405 && cy <= 465) ||
      (cx >= 440 && cx <= 490 && cy >= 455 && cy <= 510)
  },
  '-1': {
    sources: ['0', '1', '-2'],
    minDist: 14,
    // Official Floor -1 Cour Puget (104–105) & Denon (160–187 incl. Cour Visconti Islamic Art)
    match: (cx, cy) =>
      (cx >= 505 && cx <= 605 && cy >= 120 && cy <= 215) ||
      (cx >= 390 && cx <= 485 && cy >= 415 && cy <= 465) ||
      (cx >= 475 && cx <= 620 && cy >= 420 && cy <= 535)
  }
};

const nativeRoomsByFloor = Object.fromEntries(
  FLOORS.map(f => [String(f), [...floorsOutput[String(f)].rooms]])
);

for (const [floorKey, rule] of Object.entries(BACKFILL_RULES)) {
  const target = floorsOutput[floorKey];
  const floorNum = Number(floorKey);
  const existingCenters = target.rooms.map(r => [r.cx, r.cy]);
  const added = [];
  for (const srcKey of rule.sources) {
    for (const r of nativeRoomsByFloor[srcKey] || []) {
      if (r.area < 45) continue;
      if (!rule.match(r.cx, r.cy)) continue;
      if (existingCenters.some(([ex, ey]) => Math.hypot(ex - r.cx, ey - r.cy) < (rule.minDist ?? 16))) continue;
      existingCenters.push([r.cx, r.cy]);
      added.push({
        points: r.points,
        number: '',
        wing: inferWing(floorNum, null, [r.cx, r.cy]),
        cx: r.cx,
        cy: r.cy,
        area: r.area,
        name: ''
      });
    }
  }
  // Prepend backfilled polygons underneath native OSM floor rooms
  target.rooms = [...added, ...target.rooms];
}

// Build custom exact Floor 2 architectural plan from the user's PPT map (1024x429 -> 960x600)
function buildCustomFloor2Plan() {
  const S = 912 / 1024;
  const X0 = 24;
  const Y0 = 108;
  const p = (x, y) => [round1(X0 + x * S), round1(Y0 + y * S)];
  const polyStr = pts => pts.map(([x, y]) => `${x},${y}`).join(' ');
  const rectPts = (x0, y0, x1, y1) => [p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1)];
  const circlePts = (cx, cy, r, steps = 24) => Array.from({length: steps}, (_, i) => {
    const a = (Math.PI * 2 * i) / steps;
    return p(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  });

  const outerOutline = [
    [220, 0], [810, 0], [810, 122], [1023, 122], [1023, 306], [810, 306],
    [810, 428], [0, 428], [0, 367], [99, 367], [99, 336], [222, 336],
    [222, 367], [498, 367], [498, 270], [839, 270], [839, 158], [497, 158],
    [497, 61], [220, 61]
  ].map(([x, y]) => p(x, y));

  const courCarreeHole = [
    [890, 168], [982, 168], [982, 260], [890, 260]
  ].map(([x, y]) => p(x, y));

  const pathOf = pts => `M ${pts.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`;
  const footprintPath = `${pathOf(outerOutline)} ${pathOf(courCarreeHole)}`;

  const makeRectRoom = (x0, y0, x1, y1, wing, number = '', label = number) => {
    const pts = rectPts(x0, y0, x1, y1);
    const [cx, cy] = p((x0 + x1) / 2, (y0 + y1) / 2);
    return {
      points: polyStr(pts),
      number,
      wing,
      cx,
      cy,
      area: Math.round((x1 - x0) * (y1 - y0) * S * S),
      name: label ? `${label}室` : ''
    };
  };

  const r835Pts = [
    [710, 104], [769, 104], [769, 152], [723, 152], [723, 133], [710, 133]
  ].map(([x, y]) => p(x, y));
  const [c835x, c835y] = p(742, 127);

  const r924Pts = [
    [988, 199], [1020, 199], [1020, 259], [988, 259], [988, 235], [984, 235], [984, 211], [988, 211]
  ].map(([x, y]) => p(x, y));
  const [c924x, c924y] = p(1003, 229);

  const r830Pts = circlePts(792.5, 139, 16, 28);
  const [c830x, c830y] = p(792.5, 139);

  const rooms = [
    // Richelieu Wing (800-864 + 830 rotunda) — flush-snapped coordinates for seamless walls
    makeRectRoom(451, 9, 506, 51, 'richelieu', '864'),
    makeRectRoom(512, 10, 561, 40, 'richelieu', '848'),
    makeRectRoom(561, 10, 609, 40, 'richelieu', '855'),
    makeRectRoom(512, 40, 539, 108, 'richelieu', '845'),
    makeRectRoom(512, 108, 561, 129, 'richelieu', '843'),
    makeRectRoom(561, 108, 609, 129, 'richelieu', '836'),
    makeRectRoom(613, 9, 653, 50, 'richelieu', '802'),
    makeRectRoom(613, 50, 653, 92, 'richelieu', '801'),
    makeRectRoom(613, 92, 653, 133, 'richelieu', '800'),
    makeRectRoom(660, 9, 699, 47, 'richelieu', '803'),
    makeRectRoom(699, 9, 738, 47, 'richelieu', '814'),
    makeRectRoom(738, 9, 772, 47, 'richelieu', '825'),
    makeRectRoom(723, 47, 756, 79, 'richelieu', '823'),
    makeRectRoom(723, 79, 756, 104, 'richelieu', '818'),
    {points: polyStr(r835Pts), number: '835', wing: 'richelieu', cx: c835x, cy: c835y, area: 1950, name: '835室'},
    makeRectRoom(781, 9, 804, 115, 'richelieu', ''),
    {points: polyStr(r830Pts), number: '830', wing: 'richelieu', cx: c830x, cy: c830y, area: 640, name: '830室'},

    // Sully Wing (900-952) — flush-snapped coordinates for seamless walls
    makeRectRoom(814, 130, 837, 149, 'sully', '909'),
    makeRectRoom(845, 132, 909, 157, 'sully', '912'),
    makeRectRoom(845, 162, 886, 184, 'sully', '902'),
    makeRectRoom(909, 125, 949, 164, 'sully', '913'),
    makeRectRoom(949, 132, 982, 157, 'sully', ''),
    makeRectRoom(982, 126, 1020, 162, 'sully', ''),
    makeRectRoom(988, 162, 1014, 199, 'sully', '917'),
    {points: polyStr(r924Pts), number: '924', wing: 'sully', cx: c924x, cy: c924y, area: 1580, name: '924室'},
    makeRectRoom(988, 259, 1014, 284, 'sully', '929'),
    makeRectRoom(845, 233, 886, 277, 'sully', '952'),
    makeRectRoom(845, 277, 886, 301, 'sully', '944'),
    makeRectRoom(886, 277, 924, 301, 'sully', '940'),
    makeRectRoom(930, 266, 957, 301, 'sully', '936'),
    makeRectRoom(963, 277, 988, 301, 'sully', '931')
  ];

  // Connecting doorways between galleries (slightly overlapped inside rooms so fill merges seamlessly)
  const passages = [
    {wing: 'richelieu', points: polyStr(rectPts(504, 21, 514, 30))},
    {wing: 'richelieu', points: polyStr(rectPts(607, 19, 615, 28))},
    {wing: 'richelieu', points: polyStr(rectPts(607, 111, 615, 119))},
    {wing: 'richelieu', points: polyStr(rectPts(651, 20, 662, 29))},
    {wing: 'richelieu', points: polyStr(rectPts(770, 20, 783, 29))},
    {wing: 'richelieu', points: polyStr(rectPts(789, 113, 796, 126))},
    {wing: 'richelieu', points: polyStr(rectPts(767, 134, 779, 144))},
    {wing: 'sully', points: polyStr(rectPts(806, 135, 816, 144))},
    {wing: 'sully', points: polyStr(rectPts(835, 136, 847, 144))},
    {wing: 'sully', points: polyStr(rectPts(858, 155, 873, 164))},
    {wing: 'sully', points: polyStr(rectPts(922, 286, 932, 295))},
    {wing: 'sully', points: polyStr(rectPts(955, 286, 965, 295))},
    {wing: 'sully', points: polyStr(rectPts(986, 277, 999, 284))}
  ];

  // Single crisp interior partition lines ONLY where two rooms share an interior wall (no double borders!)
  const makeDivider = (x1, y1, x2, y2) => {
    const [a, b] = [p(x1, y1), p(x2, y2)];
    return {x1: a[0], y1: a[1], x2: b[0], y2: b[1]};
  };
  const dividers = [
    // Richelieu shared walls
    makeDivider(561, 10, 561, 40),   // 848 | 855
    makeDivider(512, 40, 539, 40),   // 848 / 845
    makeDivider(512, 108, 539, 108), // 845 / 843
    makeDivider(561, 108, 561, 129), // 843 | 836
    makeDivider(613, 50, 653, 50),   // 802 / 801
    makeDivider(613, 92, 653, 92),   // 801 / 800
    makeDivider(699, 9, 699, 47),    // 803 | 814
    makeDivider(738, 9, 738, 47),    // 814 | 825
    makeDivider(723, 47, 756, 47),   // 814-825 / 823
    makeDivider(723, 79, 756, 79),   // 823 / 818
    makeDivider(723, 104, 756, 104), // 818 / 835
    // Sully shared walls (unnumbered adjacent same-color blocks merge as one continuous room)
    makeDivider(909, 132, 909, 157), // 912 | 913
    makeDivider(949, 132, 949, 157), // 913 | east-NE gallery
    makeDivider(988, 199, 1014, 199),// 917 / 924
    makeDivider(845, 277, 886, 277), // 952 / 944
    makeDivider(886, 277, 886, 301)  // 944 | 940
  ];

  // Architectural inner courtyards & special/service halls (flush-snapped, zero overlapping borders)
  const courtyards = [
    {points: polyStr(rectPts(657, 54, 719, 100))},
    {points: polyStr(rectPts(760, 54, 777, 100))}
  ];
  const serviceHalls = [
    {points: polyStr(rectPts(653, 104, 710, 147)), number: '', name: '中央階段・連絡部'},
    {points: polyStr(rectPts(845, 184, 886, 233)), number: '900', name: '時計の展示室（企画展）'}
  ];

  const [ccX0, ccY0] = p(890, 168);
  const [ccX1, ccY1] = p(982, 260);
  const [pyrCx, pyrCy] = p(675, 214);

  // Uniform-size room numbers covering every numbered room from the user's PPT map
  const uniformLabelSpec = [
    ['864', 478.5, 30],
    ['848', 536.5, 25],
    ['855', 585, 25],
    ['845', 525.5, 74],
    ['843', 536.5, 118.5],
    ['836', 585, 118],
    ['802', 633.5, 29.5],
    ['801', 633, 71],
    ['800', 633, 112.5],
    ['803', 679.5, 28],
    ['814', 718.5, 28],
    ['825', 755, 28],
    ['823', 739.5, 63],
    ['818', 739.5, 91.5],
    ['835', 742, 127],
    ['830', 792.5, 139],
    ['909', 825.5, 139.5],
    ['912', 876.5, 145],
    ['913', 929, 144.5],
    ['902', 866, 172.5],
    ['900', 866, 209],
    ['952', 865.5, 255],
    ['944', 865.5, 289],
    ['940', 905.5, 289],
    ['936', 943.5, 283],
    ['931', 976, 289],
    ['917', 1000.5, 180.5],
    ['924', 1003, 229]
  ];

  const roomLabels = uniformLabelSpec.map(([number, x, y]) => {
    const [sx, sy] = p(x, y);
    return {number, x: sx, y: sy, priority: Boolean(ROOM_ANCHORS['2'][number]), uniform: true};
  });

  // Exact Floor 2 interior facilities extracted from the user's 2F facility PPT map:
  // Orange dots = WC (5), Purple dots = Elevator (5), Green triple chevrons = Stairs Down (7), Frog = Escalator (1)
  const facList = [
    // Toilets (WC)
    {id: '2f-wc-800-west', type: 'wc', pt: p(611, 113.5), label: 'トイレ'},
    {id: '2f-wc-richelieu-east', type: 'wc', pt: p(786, 109), label: 'トイレ'},
    {id: '2f-wc-sully-ne', type: 'wc', pt: p(962, 150), label: 'トイレ'},
    {id: '2f-wc-924-south', type: 'wc', pt: p(997, 246), label: 'トイレ'},
    {id: '2f-wc-940-east', type: 'wc', pt: p(921, 287), label: 'トイレ'},
    // Elevators (EV)
    {id: '2f-ev-richelieu-nw', linkId: 'ev-richelieu-nw', type: 'elevator', pt: p(603, 35.5), label: 'エレベーター'},
    {id: '2f-ev-richelieu-center', linkId: 'ev-richelieu-center', type: 'elevator', pt: p(650, 109), label: 'エレベーター'},
    {id: '2f-ev-sully-north', linkId: 'ev-sully-north', type: 'elevator', pt: p(913, 129), label: 'エレベーター'},
    {id: '2f-ev-sully-west', linkId: 'ev-sully-west', type: 'elevator', pt: p(851, 178), label: 'エレベーター'},
    {id: '2f-ev-sully-sw', linkId: 'ev-sully-sw', type: 'elevator', pt: p(883, 296), label: 'エレベーター'},
    // Escalator (Frog icon in Richelieu central grey hall)
    {id: '2f-esc-richelieu-center', linkId: 'escalator-richelieu-center', type: 'escalator', pt: p(682, 125.5), label: 'エスカレーター'},
    // Downward Stairs (Green triple chevrons — 2F is top floor)
    {id: '2f-sd-855-802', linkId: 'stairs-richelieu-nw', type: 'stairs-down', pt: p(611, 23), label: '下り階段'},
    {id: '2f-sd-912-913', linkId: 'stairs-sully-n-west', type: 'stairs-down', pt: p(906, 145), label: '下り階段'},
    {id: '2f-sd-913-east', linkId: 'stairs-sully-n-east', type: 'stairs-down', pt: p(949, 141), label: '下り階段'},
    {id: '2f-sd-sully-ne', linkId: 'stairs-sully-ne', type: 'stairs-down', pt: p(983, 144), label: '下り階段'},
    {id: '2f-sd-900-north', linkId: 'stairs-sully-west-n', type: 'stairs-down', pt: p(866, 190), label: '下り階段'},
    {id: '2f-sd-900-south', linkId: 'stairs-sully-west-s', type: 'stairs-down', pt: p(866, 226), label: '下り階段'},
    {id: '2f-sd-sully-se', linkId: 'stairs-sully-se', type: 'stairs-down', pt: p(998, 278), label: '下り階段'}
  ].map(f => ({
    id: f.id,
    ...(f.linkId ? {linkId: f.linkId} : {}),
    type: f.type,
    x: round1(f.pt[0]),
    y: round1(f.pt[1]),
    label: f.label
  }));

  return {
    subtitle: FLOOR_SUBTITLES[2],
    isCustomFloorPlan: true,
    uniformRoomLabels: true,
    customPlan: {
      footprintPath,
      courCarree: {x: ccX0, y: ccY0, width: round1(ccX1 - ccX0), height: round1(ccY1 - ccY0)},
      pyramid: {cx: pyrCx, cy: pyrCy, size: 22},
      passages,
      dividers,
      courtyards,
      serviceHalls,
      wingHeaders: [
        {label: 'リシュリュー翼', x: round1(X0 + 628 * S), y: 92},
        {label: 'シュリー翼', x: round1(X0 + 918 * S), y: 202}
      ]
    },
    wings: [
      {id: 'richelieu', label: 'リシュリュー翼', range: '800–864室', labelX: round1(X0 + 628 * S), labelY: 92},
      {id: 'sully', label: 'シュリー翼', range: '900–952室', labelX: round1(X0 + 918 * S), labelY: 202}
    ],
    labels: [],
    rooms,
    corridors: [],
    walls: [],
    doors: [],
    facilities: facList,
    roomLabels,
    roomAnchors: ROOM_ANCHORS['2']
  };
}

floorsOutput['2'] = buildCustomFloor2Plan();

// Build custom exact Floor 1 architectural plan from the user's PPT map (same 1024x429 -> 960x600 grid!)
function buildCustomFloor1Plan() {
  const S = 912 / 1024;
  const X0 = 24;
  const Y0 = 108;
  const p = (x, y) => [round1(X0 + x * S), round1(Y0 + y * S)];
  const polyStr = pts => pts.map(([x, y]) => `${x},${y}`).join(' ');
  const rectPts = (x0, y0, x1, y1) => [p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1)];
  const circlePts = (cx, cy, r, steps = 28) => Array.from({length: steps}, (_, i) => {
    const a = (Math.PI * 2 * i) / steps;
    return p(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  });

  const outerOutline = [
    [220, 0], [810, 0], [810, 122], [1023, 122], [1023, 306], [810, 306],
    [810, 428], [0, 428], [0, 367], [99, 367], [99, 336], [222, 336],
    [222, 367], [498, 367], [498, 270], [839, 270], [839, 158], [497, 158],
    [497, 61], [220, 61]
  ].map(([x, y]) => p(x, y));

  const courCarreeHole = [
    [890, 168], [982, 168], [982, 260], [890, 260]
  ].map(([x, y]) => p(x, y));

  const pathOf = pts => `M ${pts.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`;
  const footprintPath = `${pathOf(outerOutline)} ${pathOf(courCarreeHole)}`;

  const makeRectRoom = (x0, y0, x1, y1, wing, number = '', extra = {}) => {
    const pts = rectPts(x0, y0, x1, y1);
    const [cx, cy] = p((x0 + x1) / 2, (y0 + y1) / 2);
    return {
      points: polyStr(pts),
      number,
      wing,
      cx,
      cy,
      area: Math.round((x1 - x0) * (y1 - y0) * S * S),
      name: number ? `${number}室` : '',
      ...extra
    };
  };

  const r531Pts = [
    [712, 105], [771, 105], [771, 153], [724, 153], [724, 134], [712, 134]
  ].map(([x, y]) => p(x, y));
  const [c531x, c531y] = p(743, 127);

  const r528Pts = circlePts(793.5, 139.5, 16, 28);
  const [c528x, c528y] = p(793.5, 139.5);

  const r636Pts = [
    [989, 212], [1020, 212], [1020, 237], [989, 237], [989, 236], [985, 236], [985, 212]
  ].map(([x, y]) => p(x, y));
  const [c636x, c636y] = p(1003, 224.5);

  const rooms = [
    // Richelieu Wing — Under construction (工事中: 564, 558)
    makeRectRoom(379, 10, 444, 52, 'richelieu', '564', {underConstruction: true}),
    makeRectRoom(444, 10, 508, 52, 'richelieu', '558', {underConstruction: true}),

    // Richelieu Wing — Open galleries (500-557, 519, 528)
    makeRectRoom(513, 10, 561, 40, 'richelieu', '552'),
    makeRectRoom(561, 10, 610, 40, 'richelieu', '557'),
    makeRectRoom(513, 40, 540, 108, 'richelieu', '548'),
    makeRectRoom(503, 108, 541, 143, 'richelieu', '544'),
    makeRectRoom(541, 108, 610, 129, 'richelieu', '535'),
    makeRectRoom(615, 10, 654, 50, 'richelieu', '505'),
    makeRectRoom(615, 50, 654, 92, 'richelieu', '503'),
    makeRectRoom(615, 92, 654, 133, 'richelieu', '500'),
    makeRectRoom(661, 10, 714, 47, 'richelieu', '507'),
    makeRectRoom(714, 10, 773, 47, 'richelieu', '517'),
    makeRectRoom(724, 47, 757, 100, 'richelieu', '516'),
    {points: polyStr(r531Pts), number: '531', wing: 'richelieu', cx: c531x, cy: c531y, area: 1950, name: '531室'},
    makeRectRoom(782, 10, 805, 115, 'richelieu', '519'),
    {points: polyStr(r528Pts), number: '528', wing: 'richelieu', cx: c528x, cy: c528y, area: 640, name: '528室'},

    // Sully Wing (601-663)
    makeRectRoom(815, 130, 838, 149, 'sully', '606'),
    makeRectRoom(846, 133, 910, 158, 'sully', '605'),
    makeRectRoom(846, 162, 887, 184, 'sully', '601'),
    makeRectRoom(910, 125, 950, 165, 'sully', '617'),
    makeRectRoom(950, 133, 989, 157, 'sully', '632'),
    makeRectRoom(989, 163, 1014, 178, 'sully', '633'),
    makeRectRoom(989, 178, 1014, 212, 'sully', '635'),
    {points: polyStr(r636Pts), number: '636', wing: 'sully', cx: c636x, cy: c636y, area: 720, name: '636室'},
    makeRectRoom(989, 237, 1014, 272, 'sully', '640'),
    makeRectRoom(846, 234, 887, 277, 'sully', '663'),
    makeRectRoom(846, 277, 887, 304, 'sully', '660'),
    makeRectRoom(815, 277, 838, 296, 'sully', '661'),
    makeRectRoom(887, 272, 934, 283, 'sully', '650'),
    makeRectRoom(887, 293, 934, 304, 'sully', '656'),
    makeRectRoom(934, 267, 962, 304, 'sully', '652'),
    makeRectRoom(962, 272, 989, 283, 'sully', '641'),
    makeRectRoom(962, 293, 989, 304, 'sully', '651'),

    // Denon Wing (700-734)
    makeRectRoom(536, 281, 578, 306, 'denon', '700'),
    makeRectRoom(583, 275, 615, 309, 'denon', '701'),
    makeRectRoom(620, 281, 685, 305, 'denon', '702'),
    makeRectRoom(748, 275, 777, 306, 'denon', '703'),
    makeRectRoom(509, 311, 539, 393, 'denon', '715'),
    makeRectRoom(583, 316, 615, 392, 'denon', '711'),
    makeRectRoom(691, 305, 711, 400, 'denon', '709'),
    makeRectRoom(757, 306, 777, 400, 'denon', '706'),
    makeRectRoom(785, 309, 808, 423, 'denon', '705'),
    makeRectRoom(220, 400, 495, 423, 'denon', '716'),
    makeRectRoom(495, 400, 600, 423, 'denon', '712'),
    makeRectRoom(600, 400, 700, 423, 'denon', '710'),
    makeRectRoom(700, 400, 777, 423, 'denon', '708'),
    makeRectRoom(192, 347, 220, 423, 'denon', '717'),
    makeRectRoom(108, 375, 185, 393, 'denon', '718'),
    makeRectRoom(61, 375, 108, 393, 'denon', '719'),
    makeRectRoom(108, 346, 146, 363, 'denon', '726'),
    makeRectRoom(146, 346, 184, 363, 'denon', '720'),
    makeRectRoom(108, 405, 146, 423, 'denon', '734'),
    makeRectRoom(146, 405, 185, 423, 'denon', '727')
  ];

  // Connecting doorways between rooms (overlapped slightly inside rooms for seamless fusion)
  const passages = [
    // Richelieu
    {wing: 'richelieu', points: polyStr(rectPts(506, 21, 515, 31))},
    {wing: 'richelieu', points: polyStr(rectPts(608, 19, 617, 28))},
    {wing: 'richelieu', points: polyStr(rectPts(608, 110, 617, 119))},
    {wing: 'richelieu', points: polyStr(rectPts(652, 20, 663, 29))},
    {wing: 'richelieu', points: polyStr(rectPts(771, 20, 784, 29))},
    {wing: 'richelieu', points: polyStr(rectPts(790, 113, 797, 126))},
    {wing: 'richelieu', points: polyStr(rectPts(769, 134, 780, 144))},
    // Sully
    {wing: 'sully', points: polyStr(rectPts(807, 135, 817, 144))},
    {wing: 'sully', points: polyStr(rectPts(836, 136, 848, 144))},
    {wing: 'sully', points: polyStr(rectPts(859, 156, 875, 164))},
    {wing: 'sully', points: polyStr(rectPts(836, 282, 848, 291))},
    // Denon
    {wing: 'denon', points: polyStr(rectPts(576, 288, 585, 298))},
    {wing: 'denon', points: polyStr(rectPts(613, 288, 622, 298))},
    {wing: 'denon', points: polyStr(rectPts(590, 307, 608, 318))},
    {wing: 'denon', points: polyStr(rectPts(516, 391, 532, 402))},
    {wing: 'denon', points: polyStr(rectPts(590, 390, 608, 402))},
    {wing: 'denon', points: polyStr(rectPts(775, 415, 787, 423))},
    {wing: 'denon', points: polyStr(rectPts(183, 378, 194, 392))},
    {wing: 'denon', points: polyStr(rectPts(108, 361, 119, 377))},
    {wing: 'denon', points: polyStr(rectPts(161, 361, 171, 377))},
    {wing: 'denon', points: polyStr(rectPts(108, 391, 119, 407))},
    {wing: 'denon', points: polyStr(rectPts(161, 391, 171, 407))}
  ];

  // Single crisp interior partition lines ONLY where two rooms share an interior wall
  const makeDivider = (x1, y1, x2, y2) => {
    const [a, b] = [p(x1, y1), p(x2, y2)];
    return {x1: a[0], y1: a[1], x2: b[0], y2: b[1]};
  };
  const dividers = [
    // Richelieu
    makeDivider(444, 10, 444, 52),   // 564 | 558 (construction)
    makeDivider(561, 10, 561, 40),   // 552 | 557
    makeDivider(513, 40, 540, 40),   // 552 / 548
    makeDivider(513, 108, 540, 108), // 548 / 544
    makeDivider(541, 108, 541, 129), // 544 | 535
    makeDivider(615, 50, 654, 50),   // 505 / 503
    makeDivider(615, 92, 654, 92),   // 503 / 500
    makeDivider(714, 10, 714, 47),   // 507 | 517
    makeDivider(724, 47, 757, 47),   // 517 / 516
    // Sully
    makeDivider(910, 133, 910, 158), // 605 | 617
    makeDivider(950, 133, 950, 157), // 617 | 632
    makeDivider(989, 178, 1014, 178),// 633 / 635
    makeDivider(989, 212, 1014, 212),// 635 / 636
    makeDivider(989, 237, 1014, 237),// 636 / 640
    makeDivider(846, 277, 887, 277), // 663 / 660
    makeDivider(887, 272, 887, 283), // 660 | 650
    makeDivider(887, 293, 887, 304), // 660 | 656
    makeDivider(934, 272, 934, 283), // 650 | 652
    makeDivider(934, 293, 934, 304), // 656 | 652
    makeDivider(962, 272, 962, 283), // 652 | 641
    makeDivider(962, 293, 962, 304), // 652 | 651
    // Denon
    makeDivider(757, 306, 777, 306), // 703 / 706
    makeDivider(691, 400, 711, 400), // 709 / 710-708
    makeDivider(757, 400, 777, 400), // 706 / 708
    makeDivider(220, 400, 220, 423), // 717 | 716
    makeDivider(495, 400, 495, 423), // 716 | 712
    makeDivider(600, 400, 600, 423), // 712 | 710
    makeDivider(700, 400, 700, 423), // 710 | 708
    makeDivider(108, 375, 108, 393), // 719 | 718
    makeDivider(146, 346, 146, 363), // 726 | 720
    makeDivider(146, 405, 146, 423)  // 734 | 727
  ];

  // Unified light-grey courtyards
  const courtyards = [
    {points: polyStr(rectPts(544, 45, 611, 104))},
    {points: polyStr(rectPts(657, 55, 720, 101))},
    {points: polyStr(rectPts(761, 55, 778, 101))},
    {points: polyStr(rectPts(542, 313, 580, 399))},
    {points: polyStr(rectPts(620, 310, 685, 397))},
    {points: polyStr(rectPts(715, 309, 752, 396))}
  ];

  // Unified medium-grey stair / facility / service halls (IDENTICAL cool-grey across ALL wings!)
  const rotundaApollon = circlePts(796.5, 290.5, 17.5, 28);
  const serviceHalls = [
    {points: polyStr(rectPts(654, 105, 712, 147)), number: '', name: 'リシュリュー中央階段'},
    {points: polyStr(rectPts(615, 133, 654, 147)), number: '', name: 'リシュリュー階段連絡部'},
    {points: polyStr(rectPts(846, 184, 887, 234)), number: '600', name: 'ラ・シャペル（階段・連絡部）'},
    {points: polyStr(rectPts(989, 130, 1022, 163)), number: '', name: 'シュリー北東階段'},
    {points: polyStr(rectPts(989, 272, 1022, 305)), number: '', name: 'シュリー南東階段'},
    {points: polyStr(rotundaApollon), number: '', name: 'アポロン円形広間・階段'},
    {points: polyStr(rectPts(502, 274, 534, 311)), number: '', name: 'ドゥノン西階段'},
    {points: polyStr(rectPts(690, 275, 748, 305)), number: '', name: 'ダリュ階段'},
    {points: polyStr(rectPts(39, 396, 60, 425)), number: '', name: 'ドゥノン西端階段'},
    {points: polyStr(rectPts(62, 396, 83, 425)), number: '', name: 'ドゥノン西端設備'},
    {points: polyStr(rectPts(85, 396, 106, 425)), number: '', name: 'ドゥノン西端設備'}
  ];

  const [ccX0, ccY0] = p(890, 168);
  const [ccX1, ccY1] = p(982, 260);
  const [pyrCx, pyrCy] = p(675, 214);
  const [conX, conY] = p(444, 67);

  // Uniform-size room numbers covering EVERY numbered room from the user's 1F PPT map
  const uniformLabelSpec = [
    // Richelieu (incl. construction 564, 558)
    ['564', 411.5, 31],
    ['558', 476, 31],
    ['552', 537, 25],
    ['557', 585.5, 25],
    ['548', 526.5, 74],
    ['544', 522, 125.5],
    ['535', 556, 118.5],
    ['505', 634.5, 30],
    ['503', 634.5, 71],
    ['500', 634.5, 112.5],
    ['507', 687.5, 28.5],
    ['517', 743.5, 28.5],
    ['516', 740.5, 73.5],
    ['531', 743, 127],
    ['519', 793.5, 62.5],
    ['528', 793.5, 139.5],
    // Sully
    ['606', 826.5, 139.5],
    ['605', 878, 145.5],
    ['601', 866.5, 173],
    ['600', 866.5, 209],
    ['617', 930, 145],
    ['632', 966, 145],
    ['633', 1001.5, 170.5],
    ['635', 1001.5, 195],
    ['636', 1003, 224.5],
    ['640', 1001.5, 254.5],
    ['663', 866.5, 255.5],
    ['660', 866.5, 290.5],
    ['661', 826.5, 286.5],
    ['650', 910.5, 277.5],
    ['656', 910.5, 298.5],
    ['652', 948, 285.5],
    ['641', 975.5, 277.5],
    ['651', 975.5, 298.5],
    // Denon
    ['700', 557, 293.5],
    ['701', 599, 292],
    ['702', 652.5, 293],
    ['703', 762.5, 290.5],
    ['715', 524, 352],
    ['711', 599, 354],
    ['709', 701, 352.5],
    ['706', 767, 353],
    ['705', 796.5, 366],
    ['716', 357.5, 411.5],
    ['712', 547.5, 411.5],
    ['710', 650, 411.5],
    ['708', 738.5, 411.5],
    ['717', 206, 385],
    ['718', 146.5, 384],
    ['719', 84.5, 384],
    ['726', 127, 354.5],
    ['720', 159, 354.5],
    ['734', 127, 414],
    ['727', 165.5, 414]
  ];

  const roomLabels = uniformLabelSpec.map(([number, x, y]) => {
    const [sx, sy] = p(x, y);
    return {number, x: sx, y: sy, priority: Boolean(ROOM_ANCHORS['1'][number]), uniform: true};
  });

  // Exact Floor 1 interior facilities extracted from the user's 1F facility PPT map:
  // Orange dots = WC (6 open; closed 564 WC omitted per user decision),
  // Purple dots = Elevator (10), Frog = Escalator (1),
  // Green triple chevrons = Stairs Down (6) + Sully SE bidirectional Stairs Both (1),
  // Yellow triple chevrons = Stairs Up (1), Black triple chevrons = Same-floor / inter-floor stairs (5)
  const facList = [
    // Toilets (WC — 6 open; 564 under-construction toilet hidden)
    {id: '1f-wc-500-south', type: 'wc', pt: p(620, 141), label: 'トイレ'},
    {id: '1f-wc-519-south', type: 'wc', pt: p(789, 110), label: 'トイレ'},
    {id: '1f-wc-636-west', type: 'wc', pt: p(989, 215), label: 'トイレ'},
    {id: '1f-wc-650-east', type: 'wc', pt: p(931, 277.5), label: 'トイレ'},
    {id: '1f-wc-715-south', type: 'wc', pt: p(514, 388), label: 'トイレ'},
    {id: '1f-wc-720-se', type: 'wc', pt: p(176, 359), label: 'トイレ'},
    // Elevators (EV — 10; 5 linked to 2F+0F, 5 linked to 0F only [do not stop on 2F])
    {id: '1f-ev-richelieu-nw', linkId: 'ev-richelieu-nw', type: 'elevator', pt: p(604, 35.5), label: 'エレベーター'},
    {id: '1f-ev-richelieu-center', linkId: 'ev-richelieu-center', type: 'elevator', pt: p(652, 109), label: 'エレベーター'},
    {id: '1f-ev-sully-north', linkId: 'ev-sully-north', type: 'elevator', pt: p(913, 129), label: 'エレベーター'},
    {id: '1f-ev-sully-ne', linkId: 'ev-sully-ne', type: 'elevator', pt: p(985, 134), label: 'エレベーター'},
    {id: '1f-ev-sully-west', linkId: 'ev-sully-west', type: 'elevator', pt: p(851, 178.5), label: 'エレベーター'},
    {id: '1f-ev-sully-sw', linkId: 'ev-sully-sw', type: 'elevator', pt: p(895, 279), label: 'エレベーター'},
    {id: '1f-ev-denon-715', linkId: 'ev-denon-west', type: 'elevator', pt: p(513, 315), label: 'エレベーター'},
    {id: '1f-ev-denon-701-w', linkId: 'ev-denon-center-w', type: 'elevator', pt: p(591, 312.5), label: 'エレベーター'},
    {id: '1f-ev-denon-701-e', linkId: 'ev-denon-center-e', type: 'elevator', pt: p(607, 312.5), label: 'エレベーター'},
    {id: '1f-ev-denon-719', linkId: 'ev-denon-farwest', type: 'elevator', pt: p(104, 388.5), label: 'エレベーター'},
    // Escalator (Frog icon in Richelieu central grey hall — 1)
    {id: '1f-esc-richelieu-center', linkId: 'escalator-richelieu-center', type: 'escalator', pt: p(683, 125.5), label: 'エスカレーター'},
    // Downward Stairs (Green triple chevrons — 5 downward-only, all linked to 0F)
    {id: '1f-sd-531-east', linkId: 'stairs-richelieu-se', type: 'stairs-down', pt: p(767, 141.5), label: '下り階段'},
    {id: '1f-sd-sully-ne', linkId: 'stairs-sully-ne-lower', type: 'stairs-down', pt: p(1007, 157.5), label: '下り階段'},
    {id: '1f-sd-denon-west', linkId: 'stairs-denon-west', type: 'stairs-down', pt: p(518, 298), label: '下り階段'},
    {id: '1f-sd-daru', linkId: 'stairs-daru', type: 'stairs-down', pt: p(717, 296), label: '下り階段'},
    {id: '1f-sd-denon-farwest', linkId: 'stairs-denon-farwest', type: 'stairs-down', pt: p(97, 404), label: '下り階段'},
    // Bidirectional Up/Down Stairs (Black triple chevrons = up & down [5] + Sully SE [1] = 6)
    {id: '1f-sb-sully-se', linkId: 'stairs-sully-se', type: 'stairs-both', pt: p(998, 285), label: '上下階段'},
    {id: '1f-st-557-505', linkId: 'stairs-richelieu-nw', type: 'stairs-both', pt: p(613, 23), label: '上下階段'},
    {id: '1f-st-605-617', linkId: 'stairs-sully-n-west', type: 'stairs-both', pt: p(907, 146), label: '上下階段'},
    {id: '1f-st-617-632', linkId: 'stairs-sully-n-east', type: 'stairs-both', pt: p(950, 145), label: '上下階段'},
    {id: '1f-st-601-600', linkId: 'stairs-sully-west-n', type: 'stairs-both', pt: p(865, 188.5), label: '上下階段'},
    {id: '1f-st-600-663', linkId: 'stairs-sully-west-s', type: 'stairs-both', pt: p(867, 228), label: '上下階段'},
    // Upward Stairs (Yellow triple chevrons — 1)
    {id: '1f-su-sully-ne', linkId: 'stairs-sully-ne', type: 'stairs-up', pt: p(983, 149.5), label: '上り階段'},
    // Same-floor inter-room stairs (1: 535 only per user decision)
    {id: '1f-st-535', type: 'stairs', pt: p(582, 121), label: '同階階段'}
  ].map(f => ({
    id: f.id,
    ...(f.linkId ? {linkId: f.linkId} : {}),
    type: f.type,
    x: round1(f.pt[0]),
    y: round1(f.pt[1]),
    label: f.label
  }));

  return {
    subtitle: FLOOR_SUBTITLES[1],
    isCustomFloorPlan: true,
    uniformRoomLabels: true,
    hasConstruction: true,
    customPlan: {
      footprintPath,
      courCarree: {x: ccX0, y: ccY0, width: round1(ccX1 - ccX0), height: round1(ccY1 - ccY0)},
      pyramid: {cx: pyrCx, cy: pyrCy, size: 22},
      passages,
      dividers,
      courtyards,
      serviceHalls,
      constructionNotices: [
        {x: conX, y: conY, text: '工事中（閉鎖）'}
      ],
      wingHeaders: [
        {label: 'リシュリュー翼', x: round1(X0 + 628 * S), y: 92},
        {label: 'シュリー翼', x: round1(X0 + 918 * S), y: 202},
        {label: 'ドゥノン翼', x: round1(X0 + 480 * S), y: 514}
      ]
    },
    wings: [
      {id: 'richelieu', label: 'リシュリュー翼', range: '500–564室', labelX: round1(X0 + 628 * S), labelY: 92},
      {id: 'sully', label: 'シュリー翼', range: '600–663室', labelX: round1(X0 + 918 * S), labelY: 202},
      {id: 'denon', label: 'ドゥノン翼', range: '700–734室', labelX: round1(X0 + 480 * S), labelY: 514}
    ],
    labels: [],
    rooms,
    corridors: [],
    walls: [],
    doors: [],
    facilities: facList,
    roomLabels,
    roomAnchors: ROOM_ANCHORS['1']
  };
}

floorsOutput['1'] = buildCustomFloor1Plan();

// Build custom exact Floor 0 architectural plan from the user's PPT map (same 1024x429 -> 960x600 grid!)
function buildCustomFloor0Plan() {
  const S = 912 / 1024;
  const X0 = 24;
  const Y0 = 108;
  const p = (x, y) => [round1(X0 + x * S), round1(Y0 + y * S)];
  const polyStr = pts => pts.map(([x, y]) => `${x},${y}`).join(' ');
  const rectPts = (x0, y0, x1, y1) => [p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1)];
  const circlePts = (cx, cy, r, steps = 28) => Array.from({length: steps}, (_, i) => {
    const a = (Math.PI * 2 * i) / steps;
    return p(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  });

  const outerOutline = [
    [220, 0], [810, 0], [810, 122], [1023, 122], [1023, 306], [810, 306],
    [810, 428], [0, 428], [0, 367], [99, 367], [99, 336], [222, 336],
    [222, 367], [498, 367], [498, 270], [839, 270], [839, 158], [497, 158],
    [497, 61], [220, 61]
  ].map(([x, y]) => p(x, y));

  const courCarreeHole = [
    [890, 168], [982, 168], [982, 260], [890, 260]
  ].map(([x, y]) => p(x, y));

  const pathOf = pts => `M ${pts.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`;
  const footprintPath = `${pathOf(outerOutline)} ${pathOf(courCarreeHole)}`;

  const makeRectRoom = (x0, y0, x1, y1, wing, number = '', extra = {}) => {
    const pts = rectPts(x0, y0, x1, y1);
    const [cx, cy] = p((x0 + x1) / 2, (y0 + y1) / 2);
    return {
      points: polyStr(pts),
      number,
      wing,
      cx,
      cy,
      area: Math.round((x1 - x0) * (y1 - y0) * S * S),
      name: number ? `${number}室` : '',
      ...extra
    };
  };

  const r231Pts = circlePts(793.5, 139.5, 16, 28);
  const [c231x, c231y] = p(793.5, 139.5);

  const r408Pts = circlePts(796.5, 290.5, 17.5, 28);
  const [c408x, c408y] = p(796.5, 290.5);

  // Room 338 (Sphinx Crypt) with its iconic semicircular south apse
  const r338Pts = [
    p(925, 271), p(949, 271), p(949, 294),
    ...Array.from({length: 13}, (_, i) => {
      const a = (Math.PI * i) / 12;
      return p(937 + Math.cos(a) * 12, 294 + Math.sin(a) * 12);
    }),
    p(925, 294)
  ];
  const [c338x, c338y] = p(937, 284);

  const rooms = [
    // Richelieu Wing (200-236)
    makeRectRoom(513, 10, 561, 40, 'richelieu', '212'),
    makeRectRoom(561, 10, 610, 40, 'richelieu', '218'),
    makeRectRoom(513, 40, 540, 108, 'richelieu', ''),
    makeRectRoom(545, 45, 590, 100, 'richelieu', ''),
    makeRectRoom(513, 108, 540, 129, 'richelieu', '206'),
    makeRectRoom(540, 108, 565, 129, 'richelieu', '201'),
    makeRectRoom(565, 108, 608, 129, 'richelieu', '200'),

    makeRectRoom(645, 10, 686, 44, 'richelieu', '219'),
    makeRectRoom(686, 10, 725, 44, 'richelieu', '226'),
    makeRectRoom(691, 52, 726, 91, 'richelieu', ''),
    makeRectRoom(729, 10, 782, 34, 'richelieu', '227'),
    makeRectRoom(782, 10, 805, 34, 'richelieu', '230'),
    makeRectRoom(729, 34, 748, 96, 'richelieu', ''),
    makeRectRoom(751, 39, 777, 74, 'richelieu', '229'),
    makeRectRoom(782, 34, 805, 115, 'richelieu', ''),
    makeRectRoom(717, 96, 751, 124, 'richelieu', '236'),
    makeRectRoom(736, 117, 771, 146, 'richelieu', '234'),
    {points: polyStr(r231Pts), number: '231', wing: 'richelieu', cx: c231x, cy: c231y, area: 640, name: '231室'},

    // Sully Wing (300-348)
    makeRectRoom(815, 130, 838, 149, 'sully', '305'),
    makeRectRoom(846, 133, 906, 158, 'sully', '308'),
    makeRectRoom(846, 158, 887, 184, 'sully', '300'),
    makeRectRoom(910, 125, 950, 165, 'sully', '312'),
    makeRectRoom(954, 133, 989, 157, 'sully', '316'),
    makeRectRoom(989, 163, 1014, 178, 'sully', '317'),
    makeRectRoom(989, 178, 1014, 201, 'sully', '321'),
    makeRectRoom(984, 206, 1019, 229, 'sully', '327'),
    makeRectRoom(989, 235, 1014, 271, 'sully', '328'),
    makeRectRoom(846, 234, 887, 271, 'sully', '348'),
    makeRectRoom(846, 271, 887, 304, 'sully', '345'),
    makeRectRoom(887, 271, 921, 304, 'sully', '339'),
    {points: polyStr(r338Pts), number: '338', wing: 'sully', cx: c338x, cy: c338y, area: 740, name: '338室'},
    makeRectRoom(952, 271, 989, 304, 'sully', '337'),
    makeRectRoom(817, 272, 841, 291, 'sully', '347'),

    // Denon Wing — Open galleries (400-419)
    makeRectRoom(536, 282, 578, 306, 'denon', '403'),
    makeRectRoom(620, 281, 685, 304, 'denon', '406'),
    makeRectRoom(745, 275, 776, 305, 'denon', ''),
    {points: polyStr(r408Pts), number: '408', wing: 'denon', cx: c408x, cy: c408y, area: 760, name: '408室'},
    makeRectRoom(509, 311, 539, 333, 'denon', '400'),
    makeRectRoom(509, 333, 539, 392, 'denon', '402'),
    makeRectRoom(583, 316, 615, 391, 'denon', '405'),
    makeRectRoom(716, 308, 757, 396, 'denon', '419'),
    makeRectRoom(785, 309, 808, 404, 'denon', '410'),
    makeRectRoom(785, 404, 808, 424, 'denon', '413'),

    // Denon Wing — Far-west Pavillon des Sessions (424, 422, 427)
    makeRectRoom(146, 343, 216, 378, 'denon', '424'),
    makeRectRoom(146, 384, 216, 423, 'denon', '422'),
    makeRectRoom(216, 403, 264, 423, 'denon', '427'),

    // Denon Wing — Under construction (工事中: 418, 417, 415)
    makeRectRoom(690, 309, 710, 401, 'denon', '418', {underConstruction: true}),
    makeRectRoom(690, 401, 785, 424, 'denon', '417', {underConstruction: true}),
    makeRectRoom(762, 308, 782, 397, 'denon', '415', {underConstruction: true})
  ];

  const passages = [
    // Denon far-west connectors between 424 and 422 framing central lightwell
    {wing: 'denon', points: polyStr(rectPts(146, 376, 163, 386))},
    {wing: 'denon', points: polyStr(rectPts(200, 376, 216, 386))},
    // Richelieu
    {wing: 'richelieu', points: polyStr(rectPts(579, 38, 588, 47))},
    {wing: 'richelieu', points: polyStr(rectPts(538, 45, 547, 51))},
    {wing: 'richelieu', points: polyStr(rectPts(538, 91, 547, 98))},
    {wing: 'richelieu', points: polyStr(rectPts(690, 42, 696, 54))},
    {wing: 'richelieu', points: polyStr(rectPts(691, 90, 696, 106))},
    {wing: 'richelieu', points: polyStr(rectPts(760, 32, 767, 41))},
    {wing: 'richelieu', points: polyStr(rectPts(746, 59, 753, 67))},
    {wing: 'richelieu', points: polyStr(rectPts(775, 59, 784, 67))},
    {wing: 'richelieu', points: polyStr(rectPts(711, 109, 719, 123))},
    {wing: 'richelieu', points: polyStr(rectPts(790, 113, 797, 126))},
    {wing: 'richelieu', points: polyStr(rectPts(769, 134, 780, 144))},
    // Sully
    {wing: 'sully', points: polyStr(rectPts(807, 135, 817, 144))},
    {wing: 'sully', points: polyStr(rectPts(836, 136, 848, 144))},
    {wing: 'sully', points: polyStr(rectPts(904, 140, 912, 150))},
    {wing: 'sully', points: polyStr(rectPts(948, 140, 956, 150))},
    {wing: 'sully', points: polyStr(rectPts(996, 199, 1008, 208))},
    {wing: 'sully', points: polyStr(rectPts(996, 227, 1008, 237))},
    {wing: 'sully', points: polyStr(rectPts(839, 277, 848, 288))},
    {wing: 'sully', points: polyStr(rectPts(919, 276, 927, 286))},
    {wing: 'sully', points: polyStr(rectPts(947, 276, 954, 286))},
    // Denon
    {wing: 'denon', points: polyStr(rectPts(532, 288, 538, 298))},
    {wing: 'denon', points: polyStr(rectPts(683, 287, 692, 297))},
    {wing: 'denon', points: polyStr(rectPts(772, 284, 783, 298))},
    {wing: 'denon', points: polyStr(rectPts(810, 277, 819, 287))},
    {wing: 'denon', points: polyStr(rectPts(792, 304, 802, 312))},
    {wing: 'denon', points: polyStr(rectPts(694, 304, 708, 311))},
    {wing: 'denon', points: polyStr(rectPts(755, 350, 764, 356))},
    {wing: 'denon', points: polyStr(rectPts(780, 350, 787, 356))},
    {wing: 'denon', points: polyStr(rectPts(742, 394, 749, 403))}
  ];

  const makeDivider = (x1, y1, x2, y2) => {
    const [a, b] = [p(x1, y1), p(x2, y2)];
    return {x1: a[0], y1: a[1], x2: b[0], y2: b[1]};
  };
  const dividers = [
    // Richelieu
    makeDivider(561, 10, 561, 40),   // 212 | 218
    makeDivider(513, 40, 540, 40),   // 212 / west arm
    makeDivider(513, 108, 540, 108), // west arm / 206
    makeDivider(540, 108, 540, 129), // 206 | 201
    makeDivider(565, 108, 565, 129), // 201 | 200
    makeDivider(686, 10, 686, 44),   // 219 | 226
    makeDivider(782, 10, 782, 34),   // 227 | 230
    makeDivider(729, 34, 748, 34),   // 227 / west bar
    makeDivider(782, 34, 805, 34),   // 230 / east bar
    makeDivider(729, 96, 748, 96),   // west bar / 236
    makeDivider(736, 117, 751, 117), // 236 / 234
    // Sully
    makeDivider(846, 158, 887, 158), // 308 / 300
    makeDivider(989, 178, 1014, 178),// 317 / 321
    makeDivider(846, 271, 887, 271), // 348 / 345
    makeDivider(887, 271, 887, 304), // 345 | 339
    // Denon
    makeDivider(509, 333, 539, 333), // 400 / 402
    makeDivider(690, 401, 710, 401), // 418 / 417
    makeDivider(785, 404, 808, 404), // 410 / 413
    makeDivider(216, 403, 216, 423)  // 422 | 427
  ];

  const courtyards = [
    {points: polyStr(rectPts(542, 313, 580, 400))},
    {points: polyStr(rectPts(620, 310, 685, 397))}
  ];

  // Unified medium-grey stair / facility halls (IDENTICAL cool-grey across ALL wings!)
  const denonFarWestWestBar = [
    [43, 368], [51, 368], [51, 388], [63, 388], [63, 368], [106, 368], [106, 392],
    [82, 392], [82, 423], [63, 423], [63, 395], [51, 395], [51, 423], [43, 423]
  ].map(([x, y]) => p(x, y));
  const denonFarWestEastHall = [
    [106, 342], [140, 342], [140, 373], [146, 373], [146, 381], [140, 381],
    [140, 423], [85, 423], [85, 394], [106, 394], [106, 408], [125, 408],
    [125, 381], [106, 381], [106, 373], [125, 373], [125, 350], [106, 350]
  ].map(([x, y]) => p(x, y));
  const serviceHalls = [
    {points: polyStr(rectPts(658, 105, 712, 147)), number: '', name: 'リシュリュー中央階段'},
    {points: polyStr(rectPts(846, 184, 887, 234)), number: '', name: 'シュリー西階段・連絡部'},
    {points: polyStr(rectPts(989, 130, 1022, 163)), number: '', name: 'シュリー北東階段'},
    {points: polyStr(rectPts(989, 272, 1022, 305)), number: '', name: 'シュリー南東階段'},
    {points: polyStr(rectPts(502, 274, 534, 311)), number: '', name: 'ドゥノン西階段'},
    {points: polyStr(rectPts(579, 275, 620, 315)), number: '', name: 'ドゥノン中央階段'},
    {points: polyStr(rectPts(690, 275, 745, 305)), number: '', name: 'ダリュ階段'},
    {points: polyStr(denonFarWestWestBar), number: '', name: 'ドゥノン西端設備'},
    {points: polyStr(denonFarWestEastHall), number: '', name: 'ドゥノン西端階段・エレベーター'}
  ];

  const [ccX0, ccY0] = p(890, 168);
  const [ccX1, ccY1] = p(982, 260);
  const [pyrCx, pyrCy] = p(675, 214);
  const [conX, conY] = p(738, 444);

  const uniformLabelSpec = [
    // Richelieu
    ['212', 537, 25],
    ['218', 585.5, 25],
    ['206', 526.5, 118.5],
    ['201', 552.5, 118.5],
    ['200', 586.5, 118.5],
    ['219', 665.5, 27],
    ['226', 705.5, 27],
    ['227', 755.5, 22],
    ['230', 793.5, 22],
    ['229', 764, 56.5],
    ['236', 734, 110],
    ['231', 793.5, 139.5],
    // Sully
    ['305', 826.5, 139.5],
    ['308', 876, 145.5],
    ['300', 866.5, 171],
    ['312', 930, 145],
    ['316', 968, 145],
    ['317', 1001.5, 170.5],
    ['321', 1001.5, 190],
    ['327', 1004, 218],
    ['328', 1001.5, 253],
    ['348', 866.5, 252.5],
    ['345', 866.5, 287.5],
    ['339', 904, 287.5],
    ['338', 937, 284],
    ['337', 970.5, 287.5],
    ['347', 829, 281.5],
    // Denon (incl. Pavillon des Sessions 424, 422, 427 & construction 418, 417, 415)
    ['403', 557, 294],
    ['406', 652.5, 292.5],
    ['408', 796.5, 290.5],
    ['400', 527, 324],
    ['402', 524, 362.5],
    ['405', 599, 353.5],
    ['418', 700, 355],
    ['419', 736.5, 352],
    ['415', 772, 352.5],
    ['417', 737.5, 412.5],
    ['410', 796.5, 356.5],
    ['413', 796.5, 414],
    ['424', 181, 360],
    ['422', 181, 404],
    ['427', 240, 413]
  ];

  const roomLabels = uniformLabelSpec.map(([number, x, y]) => {
    const [sx, sy] = p(x, y);
    return {number, x: sx, y: sy, priority: Boolean(ROOM_ANCHORS['0'][number]), uniform: true};
  });

  // Exact Floor 0 interior facilities extracted from the user's 0F facility PPT map:
  // Orange dots = WC (3), Purple dots = Elevator (13 open; 418 under-construction EV hidden),
  // Yellow triple chevrons = Stairs Up (9), Green triple chevrons = Stairs Down (7),
  // Black triple chevrons = Same-floor stairs (8 open; 418/417 under-construction stairs hidden)
  const facList = [
    // Toilets (WC — 3)
    {id: '0f-wc-231-north', type: 'wc', pt: p(793, 121), label: 'トイレ'},
    {id: '0f-wc-312-nw', type: 'wc', pt: p(921, 134), label: 'トイレ'},
    {id: '0f-wc-sully-se', type: 'wc', pt: p(998, 301), label: 'トイレ'},
    // Elevators (EV — 13 open; 10 linked to 1F, 3 are 0F-and-below only)
    {id: '0f-ev-richelieu-nw', linkId: 'ev-richelieu-nw', type: 'elevator', pt: p(604, 35.5), label: 'エレベーター'},
    {id: '0f-ev-richelieu-center', linkId: 'ev-richelieu-center', type: 'elevator', pt: p(652, 107.5), label: 'エレベーター'},
    {id: '0f-ev-sully-north', linkId: 'ev-sully-north', type: 'elevator', pt: p(913, 121), label: 'エレベーター'},
    {id: '0f-ev-sully-ne', linkId: 'ev-sully-ne', type: 'elevator', pt: p(985, 132), label: 'エレベーター'},
    {id: '0f-ev-sully-west', linkId: 'ev-sully-west', type: 'elevator', pt: p(851, 178.5), label: 'エレベーター'},
    {id: '0f-ev-324-nw', type: 'elevator', pt: p(989, 209), label: 'エレベーター'},
    {id: '0f-ev-324-sw', linkId: 'ev-sully-se', type: 'elevator', pt: p(989, 229), label: 'エレベーター'},
    {id: '0f-ev-sully-sw', linkId: 'ev-sully-sw', type: 'elevator', pt: p(894, 276), label: 'エレベーター'},
    {id: '0f-ev-337-west', type: 'elevator', pt: p(954, 295), label: 'エレベーター'},
    {id: '0f-ev-denon-west', linkId: 'ev-denon-west', type: 'elevator', pt: p(513, 315), label: 'エレベーター'},
    {id: '0f-ev-denon-center-nw', linkId: 'ev-denon-center-nw', type: 'elevator', pt: p(586, 279), label: 'エレベーター'},
    {id: '0f-ev-denon-center-ne', linkId: 'ev-denon-center-ne', type: 'elevator', pt: p(613, 279), label: 'エレベーター'},
    {id: '0f-ev-denon-center-w', linkId: 'ev-denon-center-w', type: 'elevator', pt: p(585, 313), label: 'エレベーター'},
    {id: '0f-ev-denon-center-e', linkId: 'ev-denon-center-e', type: 'elevator', pt: p(615, 313), label: 'エレベーター'},
    {id: '0f-ev-denon-farwest', linkId: 'ev-denon-farwest', type: 'elevator', pt: p(104, 395), label: 'エレベーター'},
    // Escalator (Richelieu central grey hall — spans -1F <-> 0F <-> 1F <-> 2F per user confirmation)
    {id: '0f-esc-richelieu-center', linkId: 'escalator-richelieu-center', type: 'escalator', pt: p(683, 125.5), label: 'エスカレーター'},
    // Upward-only Stairs (5, all linked to 1F)
    {id: '0f-su-218-east', linkId: 'stairs-richelieu-nw', type: 'stairs-up', pt: p(614, 23), label: '上り階段'},
    {id: '0f-su-sully-ne', linkId: 'stairs-sully-ne-lower', type: 'stairs-up', pt: p(1007, 158), label: '上り階段'},
    {id: '0f-su-sully-se', linkId: 'stairs-sully-se', type: 'stairs-up', pt: p(998, 286), label: '上り階段'},
    {id: '0f-su-daru-east', linkId: 'stairs-daru', type: 'stairs-up', pt: p(744, 290), label: '上り階段'},
    {id: '0f-su-denon-farwest', linkId: 'stairs-denon-farwest', type: 'stairs-up', pt: p(91, 407), label: '上り階段'},
    // Downward Stairs (Green triple chevrons — 7; 321-327 & 327-328 destination unknown per user)
    {id: '0f-sd-321-324', type: 'stairs-down', pt: p(1005, 202), label: '下り階段'},
    {id: '0f-sd-324-328', type: 'stairs-down', pt: p(1005, 232), label: '下り階段'},
    {id: '0f-sd-339-338', linkId: 'stairs-sully-338', type: 'stairs-down', pt: p(922, 284), label: '下り階段'},
    {id: '0f-sd-338-337', linkId: 'stairs-sully-338', type: 'stairs-down', pt: p(956, 279), label: '下り階段'},
    {id: '0f-sd-405-north', linkId: 'stairs-denon-405-n', type: 'stairs-down', pt: p(600, 313), label: '下り階段'},
    {id: '0f-sd-402-south', linkId: 'stairs-denon-402-s', type: 'stairs-down', pt: p(528, 386), label: '下り階段'},
    {id: '0f-sd-405-south', linkId: 'stairs-denon-405-s', type: 'stairs-down', pt: p(601, 384), label: '下り階段'},
    // Bidirectional Up/Down Stairs (8 black + 4 verified -1F<->0F<->1F bidirectional = 12 open)
    {id: '0f-su-234', linkId: 'stairs-richelieu-se', type: 'stairs-both', pt: p(754, 138), label: '上下階段'},
    {id: '0f-su-sully-west-n', linkId: 'stairs-sully-west-n', type: 'stairs-both', pt: p(865, 188), label: '上下階段'},
    {id: '0f-su-sully-west-s', linkId: 'stairs-sully-west-s', type: 'stairs-both', pt: p(867, 228), label: '上下階段'},
    {id: '0f-su-daru-west', linkId: 'stairs-daru', type: 'stairs-both', pt: p(688, 293), label: '上下階段'},
    {id: '0f-st-212-inner-n', linkId: 'stairs-richelieu-102-n', type: 'stairs-both', pt: p(542, 49), label: '上下階段'},
    {id: '0f-st-206-inner-s', linkId: 'stairs-richelieu-102-s', type: 'stairs-both', pt: p(542, 94), label: '上下階段'},
    {id: '0f-st-308-312', linkId: 'stairs-sully-n-west', type: 'stairs-both', pt: p(906, 148), label: '上下階段'},
    {id: '0f-st-312-316', linkId: 'stairs-sully-n-east', type: 'stairs-both', pt: p(951, 145), label: '上下階段'},
    {id: '0f-st-316-ne', linkId: 'stairs-sully-ne-lower', type: 'stairs-both', pt: p(984, 148), label: '上下階段'},
    {id: '0f-st-denon-west', linkId: 'stairs-denon-west', type: 'stairs-both', pt: p(518, 299), label: '上下階段'},
    {id: '0f-st-403-center', linkId: 'stairs-denon-403-e', type: 'stairs-both', pt: p(580, 295), label: '上下階段'},
    {id: '0f-st-center-406', linkId: 'stairs-denon-406-w', type: 'stairs-both', pt: p(619, 294), label: '上下階段'}
  ].map(f => ({
    id: f.id,
    ...(f.linkId ? {linkId: f.linkId} : {}),
    type: f.type,
    x: round1(f.pt[0]),
    y: round1(f.pt[1]),
    label: f.label
  }));

  return {
    subtitle: FLOOR_SUBTITLES[0],
    isCustomFloorPlan: true,
    uniformRoomLabels: true,
    hasConstruction: true,
    customPlan: {
      footprintPath,
      courCarree: {x: ccX0, y: ccY0, width: round1(ccX1 - ccX0), height: round1(ccY1 - ccY0)},
      pyramid: {cx: pyrCx, cy: pyrCy, size: 22},
      passages,
      dividers,
      courtyards,
      serviceHalls,
      constructionNotices: [
        {x: conX, y: conY, text: '工事中（閉鎖）'}
      ],
      wingHeaders: [
        {label: 'リシュリュー翼', x: round1(X0 + 628 * S), y: 92},
        {label: 'シュリー翼', x: round1(X0 + 918 * S), y: 202},
        {label: 'ドゥノン翼', x: round1(X0 + 520 * S), y: 514}
      ]
    },
    wings: [
      {id: 'richelieu', label: 'リシュリュー翼', range: '200–236室', labelX: round1(X0 + 628 * S), labelY: 92},
      {id: 'sully', label: 'シュリー翼', range: '300–348室', labelX: round1(X0 + 918 * S), labelY: 202},
      {id: 'denon', label: 'ドゥノン翼', range: '400–427室', labelX: round1(X0 + 520 * S), labelY: 514}
    ],
    labels: [],
    rooms,
    corridors: [],
    walls: [],
    doors: [],
    facilities: facList,
    roomLabels,
    roomAnchors: ROOM_ANCHORS['0']
  };
}

floorsOutput['0'] = buildCustomFloor0Plan();

// Build custom exact Floor -1 architectural plan from the user's PPT map (1024x506 -> exact same 960x600 palace frame!)
function buildCustomFloorM1Plan() {
  const Sx = 912 / 1024;
  const Sy = (428 / 505) * Sx;
  const X0 = 24;
  const Y0 = 108;
  const p = (x, y) => [round1(X0 + x * Sx), round1(Y0 + y * Sy)];
  const polyStr = pts => pts.map(([x, y]) => `${x},${y}`).join(' ');
  const rectPts = (x0, y0, x1, y1) => [p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1)];
  const pathOf = pts => `M ${pts.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`;
  const circlePts = (cx, cy, rx, ry, steps = 32, rev = false) => Array.from({length: steps}, (_, i) => {
    const idx = rev ? (steps - i) % steps : i;
    const a = (Math.PI * 2 * idx) / steps;
    return p(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  });

  // Exact same palace outer silhouette as Floors 0, 1, 2
  const outerOutline = [
    [220, 0], [810, 0], [810, 144], [1023, 144], [1023, 361], [810, 361],
    [810, 505], [0, 505], [0, 433], [99, 433], [99, 397], [222, 397],
    [222, 433], [498, 433], [498, 319], [839, 319], [839, 187], [497, 187],
    [497, 72], [220, 72]
  ].map(([x, y]) => p(x, y));

  const courCarreeHole = [
    [890, 199], [982, 199], [982, 307], [890, 307]
  ].map(([x, y]) => p(x, y));

  const footprintPath = `${pathOf(outerOutline)} ${pathOf(courCarreeHole)}`;

  // Underground Carrousel Inverted Pyramid diamond + Hall Napoléon mezzanine outline
  const undergroundOutline = pathOf([
    [205, 243], [228, 243], [275, 198], [275, 172], [295, 172], [295, 198],
    [342, 245], [532, 245], [532, 207], [661, 207], [661, 242], [714, 242],
    [714, 207], [836, 207], [836, 298], [714, 298], [714, 273], [661, 273],
    [661, 298], [532, 298], [532, 263], [342, 263], [295, 308], [295, 334],
    [275, 334], [275, 308], [228, 263], [205, 263]
  ].map(([x, y]) => p(x, y)));

  const makeRectRoom = (x0, y0, x1, y1, wing, number = '', extra = {}) => {
    const pts = rectPts(x0, y0, x1, y1);
    const [cx, cy] = p((x0 + x1) / 2, (y0 + y1) / 2);
    return {
      points: polyStr(pts),
      number,
      wing,
      cx,
      cy,
      area: Math.round((x1 - x0) * (y1 - y0) * Sx * Sy),
      name: number ? `${number}室` : '',
      ...extra
    };
  };

  // Room 133 (Medieval Louvre east moat with rounded south tower)
  const r133Pts = [
    p(975, 244), p(995, 244), p(995, 310),
    ...Array.from({length: 13}, (_, i) => {
      const a = (Math.PI * i) / 12;
      return p(985 + Math.cos(a) * 10, 310 + Math.sin(a) * 11);
    }),
    p(975, 310)
  ];
  const [c133x, c133y] = p(985, 276);

  // Room 135 (Medieval Louvre circular Donjon ring with hollow center)
  const donjonOuter = circlePts(944, 293, 24, 23, 32, false);
  const donjonInner = circlePts(944, 293, 11, 10.5, 24, true);
  const donjonRingPath = `${pathOf(donjonOuter)} ${pathOf(donjonInner)}`;
  const [c135x, c135y] = p(944, 293);

  const rooms = [
    // Richelieu Wing (101, 102, 104, 105)
    makeRectRoom(527, 56, 575, 113, 'richelieu', '102'),
    makeRectRoom(582, 56, 631, 114, 'richelieu', '104'),
    makeRectRoom(640, 56, 712, 110, 'richelieu', '105'),
    makeRectRoom(527, 131, 575, 161, 'richelieu', '101'),

    // Sully Wing — Hall Napoléon East Galleries (131 north, 130 south)
    makeRectRoom(723, 211, 824, 243, 'sully', '131'),
    makeRectRoom(723, 264, 824, 295, 'sully', '130'),

    // Sully Wing — Medieval Louvre (132, 137, 135 ring, 133, 134)
    makeRectRoom(885, 244, 975, 267, 'sully', '132'),
    makeRectRoom(897, 267, 915, 318, 'sully', '137'),
    {path: donjonRingPath, points: polyStr(donjonOuter), number: '135', wing: 'sully', cx: c135x, cy: c135y, area: 920, name: '135室（中世ルーヴル天守）'},
    {points: polyStr(r133Pts), number: '133', wing: 'sully', cx: c133x, cy: c133y, area: 1050, name: '133室'},
    makeRectRoom(1002, 267, 1023, 299, 'sully', '134'),

    // Denon Wing (160-185)
    makeRectRoom(507, 323, 527, 378, 'denon', '164'),
    makeRectRoom(500, 378, 527, 435, 'denon', '169'),
    makeRectRoom(531, 325, 570, 376, 'denon', '160'),
    makeRectRoom(640, 324, 687, 376, 'denon', '170'),
    makeRectRoom(692, 321, 711, 362, 'denon', ''),
    makeRectRoom(577, 382, 631, 438, 'denon', '183'),
    makeRectRoom(636, 382, 685, 425, 'denon', '185'),
    // Denon Wing — Under construction (工事中: 180, 181, 179, 175, 174)
    makeRectRoom(647, 425, 685, 435, 'denon', '180', {underConstruction: true}),
    makeRectRoom(616, 439, 673, 452, 'denon', '181', {underConstruction: true}),
    makeRectRoom(673, 439, 699, 452, 'denon', '179', {underConstruction: true}),
    makeRectRoom(699, 368, 711, 446, 'denon', '175', {underConstruction: true}),
    makeRectRoom(716, 386, 739, 403, 'denon', '174', {underConstruction: true})
  ];

  const passages = [
    // Richelieu
    {wing: 'richelieu', points: polyStr(rectPts(573, 75, 584, 85))},
    {wing: 'richelieu', points: polyStr(rectPts(629, 75, 642, 85))},
    {wing: 'richelieu', points: polyStr(rectPts(564, 111, 575, 133))},
    {wing: 'richelieu', points: polyStr(rectPts(601, 112, 612, 135))},
    // Sully
    {wing: 'sully', points: polyStr(rectPts(913, 286, 926, 297))},
    {wing: 'sully', points: polyStr([[961, 296], [978, 307], [974, 315], [956, 304]].map(([x, y]) => p(x, y)))},
    {wing: 'sully', points: polyStr(rectPts(993, 267, 1004, 277))},
    // Denon
    {wing: 'denon', points: polyStr(rectPts(525, 340, 533, 354))},
    {wing: 'denon', points: polyStr(rectPts(568, 340, 577, 354))},
    {wing: 'denon', points: polyStr(rectPts(630, 341, 642, 353))},
    {wing: 'denon', points: polyStr(rectPts(685, 340, 694, 354))},
    {wing: 'denon', points: polyStr(rectPts(703, 360, 709, 370)), underConstruction: true},
    {wing: 'denon', points: polyStr(rectPts(649, 374, 655, 384))},
    {wing: 'denon', points: polyStr(rectPts(672, 374, 678, 384))},
    {wing: 'denon', points: polyStr(rectPts(629, 390, 638, 396))},
    {wing: 'denon', points: polyStr(rectPts(663, 433, 669, 441)), underConstruction: true}
  ];

  const makeDivider = (x1, y1, x2, y2) => {
    const [a, b] = [p(x1, y1), p(x2, y2)];
    return {x1: a[0], y1: a[1], x2: b[0], y2: b[1]};
  };
  const dividers = [
    makeDivider(897, 267, 915, 267), // 132 / 137
    makeDivider(975, 244, 975, 267), // 132 | 133
    makeDivider(507, 378, 527, 378), // 164 / 169
    makeDivider(647, 425, 685, 425), // 185 / 180
    makeDivider(673, 439, 673, 452), // 181 | 179
    makeDivider(699, 439, 699, 446)  // 179 | 175
  ];

  // Studio Rest Area (ステュディオ — 休憩エリア) in calm botanical sage green
  const studioPoly = [
    [721, 56], [788, 56], [788, 119], [749, 119], [749, 155], [677, 155], [677, 118], [721, 118]
  ].map(([x, y]) => p(x, y));
  const [stLabelX, stLabelY] = p(746, 98);
  const restAreas = [
    {points: polyStr(studioPoly), labelX: stLabelX, labelY: stLabelY, label: 'ステュディオ', sublabel: '休憩エリア'}
  ];

  // Unified cool-grey Hall Napoléon Y-concourse & stair halls (drawn seamlessly with single outer shell!)
  const concoursePolys = [
    // Richelieu horizontal connector & stair hall next to Studio
    rectPts(575, 133, 642, 145),
    rectPts(640, 118, 677, 155),
    rectPts(640, 110, 655, 120),
    // North stem + upper-Y arms framing pyramid atrium
    rectPts(586, 143, 623, 202),
    [[586, 198], [623, 198], [656, 246], [634, 255], [608, 224], [588, 224], [574, 241], [574, 213]].map(([x, y]) => p(x, y)),
    // South stem + lower-Y arms framing pyramid atrium
    [[574, 264], [588, 282], [608, 282], [634, 251], [656, 260], [623, 308], [586, 308], [574, 294]].map(([x, y]) => p(x, y)),
    rectPts(586, 304, 623, 328),
    // East bridge to Sully Medieval Louvre + Sully entry vestibule & north stair
    rectPts(640, 244, 886, 264),
    rectPts(863, 226, 886, 278),
    rectPts(885, 193, 906, 244),
    // Denon entry vestibule
    rectPts(575, 325, 632, 376),
    rectPts(590, 374, 618, 382),
    // Small wing stair/service blocks
    rectPts(499, 323, 507, 346),
    rectPts(712, 330, 740, 357),
    rectPts(1002, 299, 1023, 313)
  ].map(pts => ({points: polyStr(pts)}));

  const [ccX0, ccY0] = p(890, 199);
  const [ccX1, ccY1] = p(982, 307);
  const [pyrCx, pyrCy] = p(600, 253);
  const [conX, conY] = p(668, 474);

  // Uniform-size room numbers covering EVERY numbered room from the user's -1F PPT map
  const uniformLabelSpec = [
    // Richelieu
    ['102', 551, 84.5],
    ['104', 606.5, 85],
    ['105', 676, 83],
    ['101', 551, 146],
    // Sully (Hall Napoléon East + Medieval Louvre)
    ['131', 773.5, 227],
    ['130', 773.5, 279.5],
    ['132', 936, 255.5],
    ['137', 906, 293],
    ['135', 944, 293],
    ['133', 985, 260],
    ['134', 1012.5, 283],
    // Denon
    ['164', 517, 350.5],
    ['169', 513.5, 417],
    ['160', 550.5, 350.5],
    ['170', 663.5, 350],
    ['183', 604, 410],
    ['185', 660.5, 403],
    ['180', 666, 430],
    ['181', 644, 446],
    ['179', 686, 446],
    ['175', 705, 407],
    ['174', 727.5, 394.5]
  ];

  const roomLabels = uniformLabelSpec.map(([number, x, y]) => {
    const [sx, sy] = p(x, y);
    return {number, x: sx, y: sy, priority: Boolean(ROOM_ANCHORS['-1'][number]), uniform: true};
  });

  // Exact Floor -1 interior facilities extracted from the user's -1F facility PPT map:
  // Orange dots = WC (5 open; 179 construction WC hidden),
  // Purple dots = Elevator (11 open; 180/181/179/175 construction EVs hidden),
  // Frog = Escalator (1), Green triple chevrons = Stairs Down (3),
  // Yellow triple chevrons = Stairs Up (12), Black triple chevrons = Same-floor stairs (2 open; 175-174 construction hidden)
  const facList = [
    // Toilets (WC — 5 open)
    {id: 'm1-wc-102-n', type: 'wc', pt: p(551, 58), label: 'トイレ'},
    {id: 'm1-wc-pyramid-n', type: 'wc', pt: p(584, 200), label: 'トイレ'},
    {id: 'm1-wc-pyramid-s', type: 'wc', pt: p(583, 276), label: 'トイレ'},
    {id: 'm1-wc-sully-n', type: 'wc', pt: p(902, 209), label: 'トイレ'},
    {id: 'm1-wc-134-s', type: 'wc', pt: p(1019, 300), label: 'トイレ'},
    // Elevators (EV — 11 open; 132/137 destination unknown, central bridge is -2F<->-1F only)
    {id: 'm1-ev-102-ne', linkId: 'ev-richelieu-nw', type: 'elevator', pt: p(568, 59), label: 'エレベーター'},
    {id: 'm1-ev-richelieu-center', linkId: 'ev-richelieu-center', type: 'elevator', pt: p(644, 121), label: 'エレベーター'},
    {id: 'm1-ev-sully-n', linkId: 'ev-sully-west', type: 'elevator', pt: p(886, 197), label: 'エレベーター'},
    {id: 'm1-ev-central-bridge', linkId: 'ev-hall-napoleon-east', type: 'elevator', pt: p(714, 250), label: 'エレベーター'},
    {id: 'm1-ev-132-137', type: 'elevator', pt: p(911, 265), label: 'エレベーター'},
    {id: 'm1-ev-134-s', linkId: 'ev-sully-se', type: 'elevator', pt: p(1004, 310), label: 'エレベーター'},
    {id: 'm1-ev-denon-vest-nw', linkId: 'ev-denon-center-nw', type: 'elevator', pt: p(579, 331), label: 'エレベーター'},
    {id: 'm1-ev-denon-vest-ne', linkId: 'ev-denon-center-ne', type: 'elevator', pt: p(628, 332), label: 'エレベーター'},
    {id: 'm1-ev-denon-west', linkId: 'ev-denon-west', type: 'elevator', pt: p(506, 381), label: 'エレベーター'},
    {id: 'm1-ev-denon-center-w', linkId: 'ev-denon-center-w', type: 'elevator', pt: p(581, 370), label: 'エレベーター'},
    {id: 'm1-ev-denon-center-e', linkId: 'ev-denon-center-e', type: 'elevator', pt: p(628, 372), label: 'エレベーター'},
    // Escalator (Frog icon in Richelieu central grey hall — 1, spans -1F <-> 0F <-> 1F <-> 2F)
    {id: 'm1-esc-richelieu-center', linkId: 'escalator-richelieu-center', type: 'escalator', pt: p(658, 138), label: 'エスカレーター'},
    // Downward Stairs (Green triple chevrons — 3 around Hall Napoléon pyramid concourse, all linked to -2F)
    {id: 'm1-sd-pyramid-n', linkId: 'stairs-pyramid-n', type: 'stairs-down', pt: p(600, 218), label: '下り階段'},
    {id: 'm1-sd-pyramid-e', linkId: 'stairs-pyramid-e', type: 'stairs-down', pt: p(629, 249), label: '下り階段'},
    {id: 'm1-sd-pyramid-s', linkId: 'stairs-pyramid-s', type: 'stairs-down', pt: p(601, 275), label: '下り階段'},
    // Upward Stairs (Yellow triple chevrons — 12; 105-w destination unknown per user)
    {id: 'm1-su-102-nw', linkId: 'stairs-richelieu-102-n', type: 'stairs-up', pt: p(528, 63), label: '上り階段'},
    {id: 'm1-su-102-sw', linkId: 'stairs-richelieu-102-s', type: 'stairs-up', pt: p(530, 107), label: '上り階段'},
    {id: 'm1-su-105-w', type: 'stairs-up', pt: p(649, 89), label: '上り階段'},
    {id: 'm1-su-studio-e', linkId: 'stairs-richelieu-se', type: 'stairs-up', pt: p(763, 141), label: '上り階段'},
    {id: 'm1-su-sully-wn', linkId: 'stairs-sully-west-n', type: 'stairs-up', pt: p(875, 232), label: '上り階段'},
    {id: 'm1-su-sully-ws', linkId: 'stairs-sully-west-s', type: 'stairs-up', pt: p(875, 270), label: '上り階段'},
    {id: 'm1-su-133-s', linkId: 'stairs-sully-338', type: 'stairs-up', pt: p(985, 292), label: '上り階段'},
    {id: 'm1-su-164-w', linkId: 'stairs-denon-west', type: 'stairs-up', pt: p(504, 332), label: '上り階段'},
    {id: 'm1-su-170-e', linkId: 'stairs-daru', type: 'stairs-up', pt: p(712, 343), label: '上り階段'},
    {id: 'm1-su-169-mid', linkId: 'stairs-denon-402-s', type: 'stairs-up', pt: p(517, 396), label: '上り階段'},
    {id: 'm1-su-183-n', linkId: 'stairs-denon-405-n', type: 'stairs-up', pt: p(601, 387), label: '上り階段'},
    {id: 'm1-su-183-s', linkId: 'stairs-denon-405-s', type: 'stairs-up', pt: p(605, 445), label: '上り階段'},
    // Bidirectional Up/Down Stairs (Black triple chevrons = up & down — 2 open)
    {id: 'm1-st-160-vest', linkId: 'stairs-denon-403-e', type: 'stairs-both', pt: p(572, 348), label: '上下階段'},
    {id: 'm1-st-vest-170', linkId: 'stairs-denon-406-w', type: 'stairs-both', pt: p(635, 348), label: '上下階段'}
  ].map(f => ({
    id: f.id,
    ...(f.linkId ? {linkId: f.linkId} : {}),
    type: f.type,
    x: round1(f.pt[0]),
    y: round1(f.pt[1]),
    label: f.label
  }));

  return {
    subtitle: FLOOR_SUBTITLES['-1'],
    isCustomFloorPlan: true,
    uniformRoomLabels: true,
    hasConstruction: true,
    hasRestArea: true,
    customPlan: {
      footprintPath,
      undergroundOutline,
      courCarree: {x: ccX0, y: ccY0, width: round1(ccX1 - ccX0), height: round1(ccY1 - ccY0)},
      pyramid: {cx: pyrCx, cy: pyrCy, size: 17},
      passages,
      dividers,
      courtyards: [],
      serviceHalls: concoursePolys,
      fusedServiceHalls: true,
      restAreas,
      constructionNotices: [
        {x: conX, y: conY, text: '工事中（閉鎖）'}
      ],
      wingHeaders: [
        {label: 'リシュリュー翼', x: round1(X0 + 628 * Sx), y: 92},
        {label: 'シュリー翼', x: round1(X0 + 918 * Sx), y: 202},
        {label: 'ドゥノン翼', x: round1(X0 + 520 * Sx), y: 514}
      ]
    },
    wings: [
      {id: 'richelieu', label: 'リシュリュー翼', range: '101–105室', labelX: round1(X0 + 628 * Sx), labelY: 92},
      {id: 'sully', label: 'シュリー翼', range: '130–137室', labelX: round1(X0 + 918 * Sx), labelY: 202},
      {id: 'denon', label: 'ドゥノン翼', range: '160–185室', labelX: round1(X0 + 520 * Sx), labelY: 514}
    ],
    labels: [],
    rooms,
    corridors: [],
    walls: [],
    doors: [],
    facilities: facList,
    roomLabels,
    roomAnchors: ROOM_ANCHORS['-1']
  };
}

floorsOutput['-1'] = buildCustomFloorM1Plan();

// Build custom exact Floor -2 architectural plan from the user's PPT map (1024x506 -> exact same 960x600 palace frame!)
function buildCustomFloorM2Plan() {
  const Sx = 912 / 1024;
  const Sy = (428 / 505) * Sx;
  const X0 = 24;
  const Y0 = 108;
  const p = (x, y) => [round1(X0 + x * Sx), round1(Y0 + y * Sy)];
  const polyStr = pts => pts.map(([x, y]) => `${x},${y}`).join(' ');
  const rectPts = (x0, y0, x1, y1) => [p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1)];
  const pathOf = pts => `M ${pts.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`;
  const circlePts = (cx, cy, rx, ry, steps = 28) => Array.from({length: steps}, (_, i) => {
    const a = (Math.PI * 2 * i) / steps;
    return p(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  });

  // Exact same palace outer silhouette as Floors -1, 0, 1, 2
  const outerOutline = [
    [220, 0], [810, 0], [810, 144], [1023, 144], [1023, 361], [810, 361],
    [810, 505], [0, 505], [0, 433], [99, 433], [99, 397], [222, 397],
    [222, 433], [498, 433], [498, 319], [839, 319], [839, 187], [497, 187],
    [497, 72], [220, 72]
  ].map(([x, y]) => p(x, y));

  const courCarreeHole = [
    [890, 199], [982, 199], [982, 307], [890, 307]
  ].map(([x, y]) => p(x, y));

  const footprintPath = `${pathOf(outerOutline)} ${pathOf(courCarreeHole)}`;

  // Underground Carrousel diamond + central Hall Napoléon reception hall + East Exhibition annex frame
  const hallOutline = pathOf([
    [205, 243], [228, 243], [275, 198], [275, 172], [295, 172], [295, 198],
    [338, 250], [527, 250], [527, 212], [533, 212], [533, 199], [571, 199],
    [571, 212], [604, 212], [617, 197], [633, 212], [657, 212], [657, 236],
    [676, 253], [711, 253], [711, 278], [664, 278], [657, 285], [657, 305],
    [640, 305], [633, 312], [633, 331], [606, 331], [606, 317], [593, 305],
    [571, 305], [571, 312], [533, 312], [533, 305], [527, 305], [527, 268],
    [338, 268], [295, 308], [295, 334], [275, 334], [275, 308], [228, 263],
    [205, 263]
  ].map(([x, y]) => p(x, y)));

  const annexFrame = pathOf(rectPts(699, 187, 839, 319));
  const undergroundOutline = `${annexFrame} ${hallOutline}`;

  // Unified cool-grey Hall Napoléon service/facility blocks (ticket, bookstore, cloakroom, auditorium, WC, group reception)
  const northService = [
    [490, 165], [699, 165], [699, 237], [657, 237], [657, 212], [633, 212],
    [617, 197], [604, 212], [571, 212], [571, 199], [533, 199], [533, 212],
    [527, 212], [527, 237], [490, 237]
  ].map(([x, y]) => p(x, y));

  const westSouthService = [
    [349, 268], [417, 268], [417, 299], [443, 299], [443, 329], [349, 329]
  ].map(([x, y]) => p(x, y));

  const swSemicircle = [
    p(547, 305),
    ...Array.from({length: 19}, (_, i) => {
      const a = (Math.PI * i) / 18;
      return p(509 + Math.cos(a) * 38, 312 + Math.sin(a) * 39);
    }),
    p(471, 305)
  ];

  const serviceHalls = [
    rectPts(348, 240, 413, 250),
    westSouthService,
    northService,
    rectPts(465, 305, 533, 340),
    swSemicircle,
    rectPts(556, 305, 598, 330),
    rectPts(596, 331, 636, 348),
    rectPts(635, 305, 659, 347),
    rectPts(658, 278, 710, 294),
    rectPts(658, 285, 682, 317),
    circlePts(670, 315, 13, 12, 24)
  ].map(pts => ({points: polyStr(pts)}));

  // Light-blue Temporary Exhibition Space (企画展 — Hall Napoléon) with exact central diamond-corridor cutout
  const exhNorth = [
    [711, 213], [830, 213], [830, 255], [806, 255], [793, 245], [806, 245],
    [806, 234], [766, 234], [766, 245], [778, 245], [766, 255], [711, 255]
  ].map(([x, y]) => p(x, y));

  const exhSouth = [
    [711, 261], [766, 261], [778, 270], [766, 270], [766, 281], [806, 281],
    [806, 270], [793, 270], [806, 261], [830, 261], [830, 303], [711, 303]
  ].map(([x, y]) => p(x, y));

  const [exhLabelX, exhLabelY] = p(739, 234);
  const [exhSubX, exhSubY] = p(739, 282);
  const exhibitionAreas = [
    {points: polyStr(exhNorth)},
    {points: polyStr(exhSouth)}
  ];
  const exhibitionLabels = [
    {x: exhLabelX, y: exhLabelY, label: '企画展', sublabel: '特別展示'}
  ];

  const [ccX0, ccY0] = p(890, 199);
  const [ccX1, ccY1] = p(982, 307);
  const [pyrCx, pyrCy] = p(594, 258);

  const rooms = [
    {points: polyStr(exhNorth), number: '', wing: 'central', cx: exhLabelX, cy: exhLabelY, area: 1400, name: '企画展（北）', isExhibition: true},
    {points: polyStr(exhSouth), number: '', wing: 'central', cx: exhSubX, cy: exhSubY, area: 1400, name: '企画展（南）', isExhibition: true}
  ];

  // Exact Floor -2 interior facilities extracted from the user's -2F facility PPT map:
  // Orange dots = WC (2), Purple dots = Elevator (2), Yellow triple chevrons = Stairs Up (3),
  // Red dot = Information (1), T = Ticket (1), S = Shop (1), M = Metro (1), P = Parking (1)
  const facList = [
    // Toilets (WC — 2)
    {id: 'm2-wc-north', type: 'wc', pt: p(647, 216), label: 'トイレ'},
    {id: 'm2-wc-south', type: 'wc', pt: p(643, 299), label: 'トイレ'},
    // Elevators (EV — 2; exhibition-sw linked to -1F central bridge, pyramid-center pending confirmation)
    {id: 'm2-ev-pyramid-center', type: 'elevator', pt: p(616, 261), label: 'エレベーター'},
    {id: 'm2-ev-exhibition-sw', linkId: 'ev-hall-napoleon-east', type: 'elevator', pt: p(711, 311), label: 'エレベーター'},
    // Upward Stairs (Yellow triple chevrons — 3 around Hall Napoléon, all linked to -1F)
    {id: 'm2-su-pyramid-n', linkId: 'stairs-pyramid-n', type: 'stairs-up', pt: p(617, 211), label: '上り階段'},
    {id: 'm2-su-pyramid-e', linkId: 'stairs-pyramid-e', type: 'stairs-up', pt: p(661, 262), label: '上り階段'},
    {id: 'm2-su-pyramid-s', linkId: 'stairs-pyramid-s', type: 'stairs-up', pt: p(620, 322), label: '上り階段'},
    // Hall Napoléon & Carrousel visitor facilities (Red=案内所, T=チケット, S=ショップ, M=メトロ, P=パーキング)
    {id: 'm2-info', type: 'information', pt: p(516, 171), label: '案内所'},
    {id: 'm2-ticket', type: 'ticket', pt: p(486, 320), label: 'チケット売り場'},
    {id: 'm2-shop', type: 'shop', pt: p(386, 298), label: 'ショップ'},
    {id: 'm2-metro', type: 'metro', pt: p(285, 158), label: 'メトロ'},
    {id: 'm2-parking', type: 'parking', pt: p(190, 253), label: 'パーキング'}
  ].map(f => ({
    id: f.id,
    ...(f.linkId ? {linkId: f.linkId} : {}),
    type: f.type,
    x: round1(f.pt[0]),
    y: round1(f.pt[1]),
    label: f.label
  }));

  const [exitX, exitY] = p(285, 253);
  const hallLabels = [
    {x: exitX, y: exitY, text: '出口'}
  ];

  return {
    subtitle: FLOOR_SUBTITLES['-2'],
    isCustomFloorPlan: true,
    uniformRoomLabels: true,
    hasExhibition: true,
    customPlan: {
      footprintPath,
      undergroundOutline,
      courCarree: {x: ccX0, y: ccY0, width: round1(ccX1 - ccX0), height: round1(ccY1 - ccY0)},
      pyramid: {cx: pyrCx, cy: pyrCy, size: 19},
      passages: [],
      dividers: [],
      courtyards: [],
      serviceHalls,
      fusedServiceHalls: true,
      exhibitionAreas,
      exhibitionLabels,
      hallLabels,
      wingHeaders: []
    },
    wings: [
      {id: 'central', label: 'Hall Napoléon（ピラミッド中央入口）', range: '受付・チケット・企画展', labelX: 445, labelY: 208}
    ],
    labels: [],
    rooms,
    corridors: [],
    walls: [],
    doors: [],
    facilities: facList,
    roomLabels: [],
    roomAnchors: {}
  };
}

floorsOutput['-2'] = buildCustomFloorM2Plan();

// Verified vertical facility correspondences across ALL 5 floors (-2F <-> -1F <-> 0F <-> 1F <-> 2F: 14 EV + 1 Escalator + 23 Stairs = 38 shafts)
const verticalLinks = [
  // Elevators (14 shafts)
  {
    id: 'ev-hall-napoleon-east',
    kind: 'elevator',
    label: 'ナポレオン・ホール東エレベーター（-2F企画展南西↔-1F中央東通路）',
    stops: [
      {floor: -2, facilityId: 'm2-ev-exhibition-sw'},
      {floor: -1, facilityId: 'm1-ev-central-bridge'}
    ]
  },
  {
    id: 'ev-richelieu-nw',
    kind: 'elevator',
    label: 'リシュリュー北西エレベーター（102室↔218室↔557室↔855室）',
    stops: [
      {floor: -1, facilityId: 'm1-ev-102-ne'},
      {floor: 0, facilityId: '0f-ev-richelieu-nw'},
      {floor: 1, facilityId: '1f-ev-richelieu-nw'},
      {floor: 2, facilityId: '2f-ev-richelieu-nw'}
    ]
  },
  {
    id: 'ev-richelieu-center',
    kind: 'elevator',
    label: 'リシュリュー中央エレベーター（-1F中央↔0F中央↔500室↔800室）',
    stops: [
      {floor: -1, facilityId: 'm1-ev-richelieu-center'},
      {floor: 0, facilityId: '0f-ev-richelieu-center'},
      {floor: 1, facilityId: '1f-ev-richelieu-center'},
      {floor: 2, facilityId: '2f-ev-richelieu-center'}
    ]
  },
  {
    id: 'ev-sully-north',
    kind: 'elevator',
    label: 'シュリー北エレベーター（312室↔617室↔913室）',
    stops: [
      {floor: 0, facilityId: '0f-ev-sully-north'},
      {floor: 1, facilityId: '1f-ev-sully-north'},
      {floor: 2, facilityId: '2f-ev-sully-north'}
    ]
  },
  {
    id: 'ev-sully-west',
    kind: 'elevator',
    label: 'シュリー西エレベーター（-1F北灰↔300室↔601室↔902室）',
    stops: [
      {floor: -1, facilityId: 'm1-ev-sully-n'},
      {floor: 0, facilityId: '0f-ev-sully-west'},
      {floor: 1, facilityId: '1f-ev-sully-west'},
      {floor: 2, facilityId: '2f-ev-sully-west'}
    ]
  },
  {
    id: 'ev-sully-sw',
    kind: 'elevator',
    label: 'シュリー南西エレベーター（339室↔650室↔944/940室）',
    stops: [
      {floor: 0, facilityId: '0f-ev-sully-sw'},
      {floor: 1, facilityId: '1f-ev-sully-sw'},
      {floor: 2, facilityId: '2f-ev-sully-sw'}
    ]
  },
  {
    id: 'ev-sully-ne',
    kind: 'elevator',
    label: 'シュリー北東エレベーター（316室北東↔632室北東）',
    stops: [
      {floor: 0, facilityId: '0f-ev-sully-ne'},
      {floor: 1, facilityId: '1f-ev-sully-ne'}
    ]
  },
  {
    id: 'ev-sully-se',
    kind: 'elevator',
    label: 'シュリー東・南東エレベーター（134室南↔0F327-328間）',
    stops: [
      {floor: -1, facilityId: 'm1-ev-134-s'},
      {floor: 0, facilityId: '0f-ev-324-sw'}
    ]
  },
  {
    id: 'ev-denon-west',
    kind: 'elevator',
    label: 'ドゥノン西エレベーター（169室北西↔400室北西↔715室北西）',
    stops: [
      {floor: -1, facilityId: 'm1-ev-denon-west'},
      {floor: 0, facilityId: '0f-ev-denon-west'},
      {floor: 1, facilityId: '1f-ev-denon-715'}
    ]
  },
  {
    id: 'ev-denon-center-nw',
    kind: 'elevator',
    label: 'ドゥノン中央・北西エレベーター（-1F広間北西↔0F403-406間北西）',
    stops: [
      {floor: -1, facilityId: 'm1-ev-denon-vest-nw'},
      {floor: 0, facilityId: '0f-ev-denon-center-nw'}
    ]
  },
  {
    id: 'ev-denon-center-ne',
    kind: 'elevator',
    label: 'ドゥノン中央・北東エレベーター（-1F広間北東↔0F403-406間北東）',
    stops: [
      {floor: -1, facilityId: 'm1-ev-denon-vest-ne'},
      {floor: 0, facilityId: '0f-ev-denon-center-ne'}
    ]
  },
  {
    id: 'ev-denon-center-w',
    kind: 'elevator',
    label: 'ドゥノン中央・西エレベーター（-1F広間南西↔405室北西↔701/711室西）',
    stops: [
      {floor: -1, facilityId: 'm1-ev-denon-center-w'},
      {floor: 0, facilityId: '0f-ev-denon-center-w'},
      {floor: 1, facilityId: '1f-ev-denon-701-w'}
    ]
  },
  {
    id: 'ev-denon-center-e',
    kind: 'elevator',
    label: 'ドゥノン中央・東エレベーター（-1F広間南東↔405室北東↔701/711室東）',
    stops: [
      {floor: -1, facilityId: 'm1-ev-denon-center-e'},
      {floor: 0, facilityId: '0f-ev-denon-center-e'},
      {floor: 1, facilityId: '1f-ev-denon-701-e'}
    ]
  },
  {
    id: 'ev-denon-farwest',
    kind: 'elevator',
    label: 'ドゥノン西端エレベーター（0F西端↔719/718室南）',
    stops: [
      {floor: 0, facilityId: '0f-ev-denon-farwest'},
      {floor: 1, facilityId: '1f-ev-denon-719'}
    ]
  },
  // Escalator (-1F <-> 0F <-> 1F <-> 2F)
  {
    id: 'escalator-richelieu-center',
    kind: 'escalator',
    label: 'リシュリュー中央エスカレーター（-1F↔0F↔1F↔2F）',
    stops: [
      {floor: -1, facilityId: 'm1-esc-richelieu-center'},
      {floor: 0, facilityId: '0f-esc-richelieu-center'},
      {floor: 1, facilityId: '1f-esc-richelieu-center'},
      {floor: 2, facilityId: '2f-esc-richelieu-center'}
    ]
  },
  // Stairs (20 shafts across -1F, 0F, 1F, 2F)
  {
    id: 'stairs-richelieu-nw',
    kind: 'stairs',
    label: 'リシュリュー北西階段（218室東↔557–505間↔855–802間）',
    stops: [
      {floor: 0, facilityId: '0f-su-218-east'},
      {floor: 1, facilityId: '1f-st-557-505'},
      {floor: 2, facilityId: '2f-sd-855-802'}
    ]
  },
  {
    id: 'stairs-richelieu-102-n',
    kind: 'stairs',
    label: 'リシュリュー西・北階段（102室北西↔0F218下北）',
    stops: [
      {floor: -1, facilityId: 'm1-su-102-nw'},
      {floor: 0, facilityId: '0f-st-212-inner-n'}
    ]
  },
  {
    id: 'stairs-richelieu-102-s',
    kind: 'stairs',
    label: 'リシュリュー西・南階段（102室南西↔0F218下南）',
    stops: [
      {floor: -1, facilityId: 'm1-su-102-sw'},
      {floor: 0, facilityId: '0f-st-206-inner-s'}
    ]
  },
  {
    id: 'stairs-richelieu-se',
    kind: 'stairs',
    label: 'リシュリュー南東階段（ステュディオ東↔236右↔531東）',
    stops: [
      {floor: -1, facilityId: 'm1-su-studio-e'},
      {floor: 0, facilityId: '0f-su-234'},
      {floor: 1, facilityId: '1f-sd-531-east'}
    ]
  },
  {
    id: 'stairs-sully-n-west',
    kind: 'stairs',
    label: 'シュリー北西階段（308–312間↔605–617間↔912–913間）',
    stops: [
      {floor: 0, facilityId: '0f-st-308-312'},
      {floor: 1, facilityId: '1f-st-605-617'},
      {floor: 2, facilityId: '2f-sd-912-913'}
    ]
  },
  {
    id: 'stairs-sully-n-east',
    kind: 'stairs',
    label: 'シュリー北中央階段（312–316間↔617–632間↔913室東）',
    stops: [
      {floor: 0, facilityId: '0f-st-312-316'},
      {floor: 1, facilityId: '1f-st-617-632'},
      {floor: 2, facilityId: '2f-sd-913-east'}
    ]
  },
  {
    id: 'stairs-sully-ne',
    kind: 'stairs',
    label: 'シュリー北東階段（632室東↔913室東奥）',
    stops: [
      {floor: 1, facilityId: '1f-su-sully-ne'},
      {floor: 2, facilityId: '2f-sd-sully-ne'}
    ]
  },
  {
    id: 'stairs-sully-ne-lower',
    kind: 'stairs',
    label: 'シュリー北東下層階段（0F北東・316東↔1F北東）',
    stops: [
      {floor: 0, facilityId: '0f-su-sully-ne'},
      {floor: 0, facilityId: '0f-st-316-ne'},
      {floor: 1, facilityId: '1f-sd-sully-ne'}
    ]
  },
  {
    id: 'stairs-sully-west-n',
    kind: 'stairs',
    label: 'シュリー西・北階段（-1F西灰北↔0F西灰北↔601–600間↔900室北）',
    stops: [
      {floor: -1, facilityId: 'm1-su-sully-wn'},
      {floor: 0, facilityId: '0f-su-sully-west-n'},
      {floor: 1, facilityId: '1f-st-601-600'},
      {floor: 2, facilityId: '2f-sd-900-north'}
    ]
  },
  {
    id: 'stairs-sully-west-s',
    kind: 'stairs',
    label: 'シュリー西・南階段（-1F西灰南↔0F西灰南↔600–663間↔900室南）',
    stops: [
      {floor: -1, facilityId: 'm1-su-sully-ws'},
      {floor: 0, facilityId: '0f-su-sully-west-s'},
      {floor: 1, facilityId: '1f-st-600-663'},
      {floor: 2, facilityId: '2f-sd-900-south'}
    ]
  },
  {
    id: 'stairs-sully-se',
    kind: 'stairs',
    label: 'シュリー南東階段（0F南東↔1F南東↔931/929室南東）',
    stops: [
      {floor: 0, facilityId: '0f-su-sully-se'},
      {floor: 1, facilityId: '1f-sb-sully-se'},
      {floor: 2, facilityId: '2f-sd-sully-se'}
    ]
  },
  {
    id: 'stairs-sully-338',
    kind: 'stairs',
    label: 'シュリー338室階段（133室南↔338室［339側・337側］）',
    stops: [
      {floor: -1, facilityId: 'm1-su-133-s'},
      {floor: 0, facilityId: '0f-sd-339-338'},
      {floor: 0, facilityId: '0f-sd-338-337'}
    ]
  },
  {
    id: 'stairs-daru',
    kind: 'stairs',
    label: 'ダリュ階段（170室東↔0Fダリュ西・東↔1Fダリュ踊り場）',
    stops: [
      {floor: -1, facilityId: 'm1-su-170-e'},
      {floor: 0, facilityId: '0f-su-daru-west'},
      {floor: 0, facilityId: '0f-su-daru-east'},
      {floor: 1, facilityId: '1f-sd-daru'}
    ]
  },
  {
    id: 'stairs-denon-west',
    kind: 'stairs',
    label: 'ドゥノン西階段（164室西↔0Fドゥノン西↔1Fドゥノン西）',
    stops: [
      {floor: -1, facilityId: 'm1-su-164-w'},
      {floor: 0, facilityId: '0f-st-denon-west'},
      {floor: 1, facilityId: '1f-sd-denon-west'}
    ]
  },
  {
    id: 'stairs-denon-403-e',
    kind: 'stairs',
    label: 'ドゥノン403東階段（160–広間↔403室東）',
    stops: [
      {floor: -1, facilityId: 'm1-st-160-vest'},
      {floor: 0, facilityId: '0f-st-403-center'}
    ]
  },
  {
    id: 'stairs-denon-406-w',
    kind: 'stairs',
    label: 'ドゥノン406西階段（広間–170↔406室西）',
    stops: [
      {floor: -1, facilityId: 'm1-st-vest-170'},
      {floor: 0, facilityId: '0f-st-center-406'}
    ]
  },
  {
    id: 'stairs-denon-402-s',
    kind: 'stairs',
    label: 'ドゥノン南西階段（169室内↔402室南）',
    stops: [
      {floor: -1, facilityId: 'm1-su-169-mid'},
      {floor: 0, facilityId: '0f-sd-402-south'}
    ]
  },
  {
    id: 'stairs-denon-405-n',
    kind: 'stairs',
    label: 'ドゥノン中央・北階段（183室北↔405室北）',
    stops: [
      {floor: -1, facilityId: 'm1-su-183-n'},
      {floor: 0, facilityId: '0f-sd-405-north'}
    ]
  },
  {
    id: 'stairs-denon-405-s',
    kind: 'stairs',
    label: 'ドゥノン中央・南階段（183室南↔405室南）',
    stops: [
      {floor: -1, facilityId: 'm1-su-183-s'},
      {floor: 0, facilityId: '0f-sd-405-south'}
    ]
  },
  {
    id: 'stairs-denon-farwest',
    kind: 'stairs',
    label: 'ドゥノン西端階段（0F西端↔1F西端）',
    stops: [
      {floor: 0, facilityId: '0f-su-denon-farwest'},
      {floor: 1, facilityId: '1f-sd-denon-farwest'}
    ]
  },
  // Stairs spanning -2F <-> -1F (3 Hall Napoléon pyramid stairs)
  {
    id: 'stairs-pyramid-n',
    kind: 'stairs',
    label: 'ピラミッド北階段（-2F北↔-1F北）',
    stops: [
      {floor: -2, facilityId: 'm2-su-pyramid-n'},
      {floor: -1, facilityId: 'm1-sd-pyramid-n'}
    ]
  },
  {
    id: 'stairs-pyramid-e',
    kind: 'stairs',
    label: 'ピラミッド東階段（-2F東↔-1F東）',
    stops: [
      {floor: -2, facilityId: 'm2-su-pyramid-e'},
      {floor: -1, facilityId: 'm1-sd-pyramid-e'}
    ]
  },
  {
    id: 'stairs-pyramid-s',
    kind: 'stairs',
    label: 'ピラミッド南階段（-2F南↔-1F南）',
    stops: [
      {floor: -2, facilityId: 'm2-su-pyramid-s'},
      {floor: -1, facilityId: 'm1-sd-pyramid-s'}
    ]
  }
];

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

// ==================== REBUILD NAVIGATION GRAPH ALIGNED TO GEOJSON ====================
const works = JSON.parse(fs.readFileSync(worksPath, 'utf8'));
const floorTag = f => (f < 0 ? `fm${Math.abs(f)}` : `f${f}`);

const nodes = [
  // Floor -2 (aligned to user's exact -2F Hall Napoléon PPT coordinates & verified -2F-to--1F shafts)
  {id: 'entrance:pyramid:fm2', type: 'entrance', floor: -2, x: 544, y: 303, label: 'ピラミッド中央入口'},
  {id: 'junction:fm2:core', type: 'junction', floor: -2, x: 562, y: 303, label: 'ナポレオン・ホール中央'},
  {id: 'stairs:pyramid-n:fm2', type: 'stairs', floor: -2, x: 573.5, y: 267.3, label: 'ピラミッド北階段', facilityId: 'stairs-pyramid-n'},
  {id: 'stairs:pyramid-e:fm2', type: 'stairs', floor: -2, x: 612.7, y: 305.8, label: 'ピラミッド東階段', facilityId: 'stairs-pyramid-e'},
  {id: 'stairs:pyramid-s:fm2', type: 'stairs', floor: -2, x: 576.2, y: 351.1, label: 'ピラミッド南階段', facilityId: 'stairs-pyramid-s'},
  {id: 'elevator:hall-napoleon-east:fm2', type: 'elevator', floor: -2, x: 657.2, y: 342.8, label: 'ナポレオン・ホール東エレベーター', facilityId: 'ev-hall-napoleon-east'},

  // Floor -1 (aligned to user's exact -1F PPT architectural coordinates & all confirmed -2F--1F-0F shafts)
  {id: 'junction:fm1:core', type: 'junction', floor: -1, x: 562, y: 299, label: '中央連絡部'},
  {id: 'stairs:pyramid-n:fm1', type: 'stairs', floor: -1, x: 558.4, y: 272.6, label: 'ピラミッド北階段', facilityId: 'stairs-pyramid-n'},
  {id: 'stairs:pyramid-e:fm1', type: 'stairs', floor: -1, x: 584.2, y: 296.0, label: 'ピラミッド東階段', facilityId: 'stairs-pyramid-e'},
  {id: 'stairs:pyramid-s:fm1', type: 'stairs', floor: -1, x: 559.3, y: 315.6, label: 'ピラミッド南階段', facilityId: 'stairs-pyramid-s'},
  {id: 'elevator:hall-napoleon-east:fm1', type: 'elevator', floor: -1, x: 659.9, y: 296.7, label: 'ナポレオン・ホール東エレベーター', facilityId: 'ev-hall-napoleon-east'},
  {id: 'elevator:central:fm1', type: 'elevator', floor: -1, x: 597.6, y: 199.3, label: 'リシュリュー中央エレベーター', facilityId: 'ev-richelieu-center'},
  {id: 'elevator:richelieu-nw:fm1', type: 'elevator', floor: -1, x: 529.9, y: 152.5, label: 'リシュリュー北西エレベーター', facilityId: 'ev-richelieu-nw'},
  {id: 'elevator:sully-west:fm1', type: 'elevator', floor: -1, x: 813.1, y: 256.7, label: 'シュリー西エレベーター', facilityId: 'ev-sully-west'},
  {id: 'elevator:sully-se:fm1', type: 'elevator', floor: -1, x: 918.2, y: 342.0, label: 'シュリー東・南東エレベーター', facilityId: 'ev-sully-se'},
  {id: 'escalator:richelieu-center:fm1', type: 'escalator', floor: -1, x: 610.0, y: 212.1, label: 'リシュリュー中央エスカレーター', facilityId: 'escalator-richelieu-center'},
  {id: 'stairs:richelieu-102-n:fm1', type: 'stairs', floor: -1, x: 494.2, y: 155.5, label: 'リシュリュー西・北階段', facilityId: 'stairs-richelieu-102-n'},
  {id: 'stairs:richelieu-102-s:fm1', type: 'stairs', floor: -1, x: 496.0, y: 188.7, label: 'リシュリュー西・南階段', facilityId: 'stairs-richelieu-102-s'},
  {id: 'stairs:richelieu-se:fm1', type: 'stairs', floor: -1, x: 703.5, y: 214.4, label: 'リシュリュー南東階段', facilityId: 'stairs-richelieu-se'},
  {id: 'stairs:sully-west-n:fm1', type: 'stairs', floor: -1, x: 803.3, y: 283.1, label: 'シュリー西・北階段', facilityId: 'stairs-sully-west-n'},
  {id: 'stairs:sully-west-s:fm1', type: 'stairs', floor: -1, x: 803.3, y: 311.8, label: 'シュリー西・南階段', facilityId: 'stairs-sully-west-s'},
  {id: 'stairs:sully-338:fm1', type: 'stairs', floor: -1, x: 901.3, y: 328.4, label: 'シュリー338室階段', facilityId: 'stairs-sully-338'},
  {id: 'elevator:denon-west:fm1', type: 'elevator', floor: -1, x: 474.7, y: 395.6, label: 'ドゥノン西エレベーター', facilityId: 'ev-denon-west'},
  {id: 'elevator:denon-center-nw:fm1', type: 'elevator', floor: -1, x: 539.7, y: 357.8, label: 'ドゥノン中央・北西エレベーター', facilityId: 'ev-denon-center-nw'},
  {id: 'elevator:denon-center-ne:fm1', type: 'elevator', floor: -1, x: 583.3, y: 358.6, label: 'ドゥノン中央・北東エレベーター', facilityId: 'ev-denon-center-ne'},
  {id: 'elevator:denon-center-w:fm1', type: 'elevator', floor: -1, x: 541.5, y: 387.3, label: 'ドゥノン中央・西エレベーター', facilityId: 'ev-denon-center-w'},
  {id: 'elevator:denon-center-e:fm1', type: 'elevator', floor: -1, x: 583.3, y: 388.8, label: 'ドゥノン中央・東エレベーター', facilityId: 'ev-denon-center-e'},
  {id: 'stairs:denon-west:fm1', type: 'stairs', floor: -1, x: 472.9, y: 358.6, label: 'ドゥノン西階段', facilityId: 'stairs-denon-west'},
  {id: 'stairs:denon-403-e:fm1', type: 'stairs', floor: -1, x: 533.4, y: 370.7, label: 'ドゥノン403東階段', facilityId: 'stairs-denon-403-e'},
  {id: 'stairs:denon-406-w:fm1', type: 'stairs', floor: -1, x: 589.6, y: 370.7, label: 'ドゥノン406西階段', facilityId: 'stairs-denon-406-w'},
  {id: 'stairs:daru:fm1', type: 'stairs', floor: -1, x: 658.1, y: 366.9, label: 'ダリュ階段', facilityId: 'stairs-daru'},
  {id: 'stairs:denon-402-s:fm1', type: 'stairs', floor: -1, x: 484.5, y: 406.9, label: 'ドゥノン南西階段', facilityId: 'stairs-denon-402-s'},
  {id: 'stairs:denon-405-n:fm1', type: 'stairs', floor: -1, x: 559.3, y: 400.1, label: 'ドゥノン中央・北階段', facilityId: 'stairs-denon-405-n'},
  {id: 'stairs:denon-405-s:fm1', type: 'stairs', floor: -1, x: 562.8, y: 443.9, label: 'ドゥノン中央・南階段', facilityId: 'stairs-denon-405-s'},
  {id: 'junction:fm1:richelieu', type: 'junction', floor: -1, x: 562, y: 213, label: 'リシュリュー翼連絡部'},
  {id: 'junction:fm1:sully', type: 'junction', floor: -1, x: 803, y: 299, label: 'シュリー翼連絡部'},
  {id: 'junction:fm1:denon', type: 'junction', floor: -1, x: 562, y: 372, label: 'ドゥノン翼連絡部'},

  // Floor 0 (aligned to user's exact 0F PPT architectural coordinates & all confirmed -1F-0F-1F vertical shafts)
  {id: 'junction:f0:core', type: 'junction', floor: 0, x: 634, y: 220, label: '中央連絡部'},
  {id: 'elevator:central:f0', type: 'elevator', floor: 0, x: 604.7, y: 203.7, label: 'リシュリュー中央エレベーター', facilityId: 'ev-richelieu-center'},
  {id: 'escalator:richelieu-center:f0', type: 'escalator', floor: 0, x: 632.3, y: 219.8, label: 'リシュリュー中央エスカレーター', facilityId: 'escalator-richelieu-center'},
  {id: 'stairs:richelieu-102-n:f0', type: 'stairs', floor: 0, x: 506.7, y: 151.6, label: 'リシュリュー西・北階段', facilityId: 'stairs-richelieu-102-n'},
  {id: 'stairs:richelieu-102-s:f0', type: 'stairs', floor: 0, x: 506.7, y: 191.7, label: 'リシュリュー西・南階段', facilityId: 'stairs-richelieu-102-s'},
  {id: 'elevator:richelieu-nw:f0', type: 'elevator', floor: 0, x: 561.9, y: 139.6, label: 'リシュリュー北西エレベーター', facilityId: 'ev-richelieu-nw'},
  {id: 'elevator:sully-north:f0', type: 'elevator', floor: 0, x: 837.1, y: 215.8, label: 'シュリー北エレベーター', facilityId: 'ev-sully-north'},
  {id: 'elevator:sully-ne:f0', type: 'elevator', floor: 0, x: 901.3, y: 225.6, label: 'シュリー北東エレベーター', facilityId: 'ev-sully-ne'},
  {id: 'elevator:sully-west:f0', type: 'elevator', floor: 0, x: 781.9, y: 267.0, label: 'シュリー西エレベーター', facilityId: 'ev-sully-west'},
  {id: 'elevator:sully-sw:f0', type: 'elevator', floor: 0, x: 820.2, y: 353.8, label: 'シュリー南西エレベーター', facilityId: 'ev-sully-sw'},
  {id: 'elevator:sully-se:f0', type: 'elevator', floor: 0, x: 904.8, y: 311.9, label: 'シュリー東・南東エレベーター', facilityId: 'ev-sully-se'},
  {id: 'elevator:denon-west:f0', type: 'elevator', floor: 0, x: 480.9, y: 388.5, label: 'ドゥノン西エレベーター', facilityId: 'ev-denon-west'},
  {id: 'elevator:denon-center-nw:f0', type: 'elevator', floor: 0, x: 545.9, y: 356.5, label: 'ドゥノン中央・北西エレベーター', facilityId: 'ev-denon-center-nw'},
  {id: 'elevator:denon-center-ne:f0', type: 'elevator', floor: 0, x: 569.9, y: 356.5, label: 'ドゥノン中央・北東エレベーター', facilityId: 'ev-denon-center-ne'},
  {id: 'elevator:denon-center-w:f0', type: 'elevator', floor: 0, x: 545.0, y: 386.8, label: 'ドゥノン中央・西エレベーター', facilityId: 'ev-denon-center-w'},
  {id: 'elevator:denon-center-e:f0', type: 'elevator', floor: 0, x: 571.7, y: 386.8, label: 'ドゥノン中央・東エレベーター', facilityId: 'ev-denon-center-e'},
  {id: 'elevator:denon-farwest:f0', type: 'elevator', floor: 0, x: 116.6, y: 459.8, label: 'ドゥノン西端エレベーター', facilityId: 'ev-denon-farwest'},
  {id: 'stairs:richelieu-nw:f0', type: 'stairs', floor: 0, x: 570.8, y: 128.5, label: 'リシュリュー北西階段', facilityId: 'stairs-richelieu-nw'},
  {id: 'stairs:richelieu-se:f0', type: 'stairs', floor: 0, x: 695.5, y: 230.9, label: 'リシュリュー南東階段', facilityId: 'stairs-richelieu-se'},
  {id: 'stairs:sully-n-west:f0', type: 'stairs', floor: 0, x: 830.9, y: 239.8, label: 'シュリー北西階段', facilityId: 'stairs-sully-n-west'},
  {id: 'stairs:sully-n-east:f0', type: 'stairs', floor: 0, x: 871.0, y: 237.1, label: 'シュリー北中央階段', facilityId: 'stairs-sully-n-east'},
  {id: 'stairs:sully-ne-lower:f0', type: 'stairs', floor: 0, x: 920.9, y: 248.7, label: 'シュリー北東下層階段', facilityId: 'stairs-sully-ne-lower'},
  {id: 'stairs:sully-west-n:f0', type: 'stairs', floor: 0, x: 794.4, y: 275.4, label: 'シュリー西・北階段', facilityId: 'stairs-sully-west-n'},
  {id: 'stairs:sully-west-s:f0', type: 'stairs', floor: 0, x: 796.2, y: 311.1, label: 'シュリー西・南階段', facilityId: 'stairs-sully-west-s'},
  {id: 'stairs:sully-se:f0', type: 'stairs', floor: 0, x: 912.8, y: 362.7, label: 'シュリー南東階段', facilityId: 'stairs-sully-se'},
  {id: 'stairs:sully-338:f0', type: 'stairs', floor: 0, x: 859.0, y: 361.0, label: 'シュリー338室階段', facilityId: 'stairs-sully-338'},
  {id: 'stairs:daru-west:f0', type: 'stairs', floor: 0, x: 636.8, y: 369.0, label: 'ダリュ階段（西）', facilityId: 'stairs-daru'},
  {id: 'stairs:daru-east:f0', type: 'stairs', floor: 0, x: 686.6, y: 366.3, label: 'ダリュ階段（東）', facilityId: 'stairs-daru'},
  {id: 'stairs:denon-west:f0', type: 'stairs', floor: 0, x: 485.3, y: 374.3, label: 'ドゥノン西階段', facilityId: 'stairs-denon-west'},
  {id: 'stairs:denon-403-e:f0', type: 'stairs', floor: 0, x: 540.6, y: 370.7, label: 'ドゥノン403東階段', facilityId: 'stairs-denon-403-e'},
  {id: 'stairs:denon-406-w:f0', type: 'stairs', floor: 0, x: 575.3, y: 369.8, label: 'ドゥノン406西階段', facilityId: 'stairs-denon-406-w'},
  {id: 'stairs:denon-402-s:f0', type: 'stairs', floor: 0, x: 494.2, y: 451.8, label: 'ドゥノン南西階段', facilityId: 'stairs-denon-402-s'},
  {id: 'stairs:denon-405-n:f0', type: 'stairs', floor: 0, x: 558.4, y: 386.8, label: 'ドゥノン中央・北階段', facilityId: 'stairs-denon-405-n'},
  {id: 'stairs:denon-405-s:f0', type: 'stairs', floor: 0, x: 559.3, y: 450.0, label: 'ドゥノン中央・南階段', facilityId: 'stairs-denon-405-s'},
  {id: 'stairs:denon-farwest:f0', type: 'stairs', floor: 0, x: 105.0, y: 470.5, label: 'ドゥノン西端階段', facilityId: 'stairs-denon-farwest'},
  {id: 'junction:f0:richelieu', type: 'junction', floor: 0, x: 678, y: 206, label: 'リシュリュー翼廊下'},
  {id: 'junction:f0:sully', type: 'junction', floor: 0, x: 796, y: 312, label: 'シュリー翼連絡部'},
  {id: 'junction:f0:denon', type: 'junction', floor: 0, x: 558, y: 369, label: 'ドゥノン翼廊下'},

  // Floor 1 (aligned to user's exact 1F PPT architectural coordinates & verified 0F-1F-2F vertical shafts)
  {id: 'junction:f1:core', type: 'junction', floor: 1, x: 632, y: 220, label: '中央連絡部'},
  {id: 'elevator:central:f1', type: 'elevator', floor: 1, x: 604.7, y: 205.1, label: 'リシュリュー中央エレベーター', facilityId: 'ev-richelieu-center'},
  {id: 'escalator:richelieu-center:f1', type: 'escalator', floor: 1, x: 632.3, y: 219.8, label: 'リシュリュー中央エスカレーター', facilityId: 'escalator-richelieu-center'},
  {id: 'elevator:richelieu-nw:f1', type: 'elevator', floor: 1, x: 561.9, y: 139.6, label: 'リシュリュー北西エレベーター', facilityId: 'ev-richelieu-nw'},
  {id: 'elevator:sully-north:f1', type: 'elevator', floor: 1, x: 837.1, y: 222.9, label: 'シュリー北エレベーター', facilityId: 'ev-sully-north'},
  {id: 'elevator:sully-ne:f1', type: 'elevator', floor: 1, x: 901.3, y: 227.3, label: 'シュリー北東エレベーター', facilityId: 'ev-sully-ne'},
  {id: 'elevator:sully-west:f1', type: 'elevator', floor: 1, x: 781.9, y: 267.0, label: 'シュリー西エレベーター', facilityId: 'ev-sully-west'},
  {id: 'elevator:sully-sw:f1', type: 'elevator', floor: 1, x: 821.1, y: 356.5, label: 'シュリー南西エレベーター', facilityId: 'ev-sully-sw'},
  {id: 'elevator:denon-west:f1', type: 'elevator', floor: 1, x: 480.9, y: 388.5, label: 'ドゥノン西エレベーター', facilityId: 'ev-denon-west'},
  {id: 'elevator:denon-center-w:f1', type: 'elevator', floor: 1, x: 550.4, y: 386.3, label: 'ドゥノン中央・西エレベーター', facilityId: 'ev-denon-center-w'},
  {id: 'elevator:denon-center-e:f1', type: 'elevator', floor: 1, x: 564.6, y: 386.3, label: 'ドゥノン中央・東エレベーター', facilityId: 'ev-denon-center-e'},
  {id: 'elevator:denon-farwest:f1', type: 'elevator', floor: 1, x: 116.6, y: 454.0, label: 'ドゥノン西端エレベーター', facilityId: 'ev-denon-farwest'},
  {id: 'stairs:richelieu-nw:f1', type: 'stairs', floor: 1, x: 569.9, y: 128.5, label: 'リシュリュー北西階段', facilityId: 'stairs-richelieu-nw'},
  {id: 'stairs:richelieu-se:f1', type: 'stairs', floor: 1, x: 707.1, y: 234.0, label: 'リシュリュー南東階段', facilityId: 'stairs-richelieu-se'},
  {id: 'stairs:sully-n-west:f1', type: 'stairs', floor: 1, x: 831.8, y: 238.0, label: 'シュリー北西階段', facilityId: 'stairs-sully-n-west'},
  {id: 'stairs:sully-n-east:f1', type: 'stairs', floor: 1, x: 870.1, y: 237.1, label: 'シュリー北中央階段', facilityId: 'stairs-sully-n-east'},
  {id: 'stairs:sully-ne:f1', type: 'stairs', floor: 1, x: 899.5, y: 241.1, label: 'シュリー北東階段', facilityId: 'stairs-sully-ne'},
  {id: 'stairs:sully-ne-lower:f1', type: 'stairs', floor: 1, x: 920.9, y: 248.3, label: 'シュリー北東下層階段', facilityId: 'stairs-sully-ne-lower'},
  {id: 'stairs:sully-west-n:f1', type: 'stairs', floor: 1, x: 794.4, y: 275.9, label: 'シュリー西・北階段', facilityId: 'stairs-sully-west-n'},
  {id: 'stairs:sully-west-s:f1', type: 'stairs', floor: 1, x: 796.2, y: 311.1, label: 'シュリー西・南階段', facilityId: 'stairs-sully-west-s'},
  {id: 'stairs:sully-se:f1', type: 'stairs', floor: 1, x: 912.8, y: 361.8, label: 'シュリー南東階段', facilityId: 'stairs-sully-se'},
  {id: 'stairs:daru:f1', type: 'stairs', floor: 1, x: 662.6, y: 371.6, label: 'ダリュ階段', facilityId: 'stairs-daru'},
  {id: 'stairs:denon-west:f1', type: 'stairs', floor: 1, x: 485.3, y: 373.4, label: 'ドゥノン西階段', facilityId: 'stairs-denon-west'},
  {id: 'stairs:denon-farwest:f1', type: 'stairs', floor: 1, x: 110.4, y: 467.8, label: 'ドゥノン西端階段', facilityId: 'stairs-denon-farwest'},
  {id: 'junction:f1:richelieu', type: 'junction', floor: 1, x: 589, y: 208, label: 'リシュリュー翼連絡部'},
  {id: 'junction:f1:sully', type: 'junction', floor: 1, x: 796, y: 315, label: 'シュリー翼連絡部'},
  {id: 'junction:f1:denon-east', type: 'junction', floor: 1, x: 703, y: 367, label: 'ドゥノン翼東分岐'},
  {id: 'junction:f1:denon-center', type: 'junction', floor: 1, x: 558, y: 368, label: 'サロン・ドゥノン'},
  {id: 'junction:f1:grande-galerie', type: 'junction', floor: 1, x: 558, y: 475, label: 'グラン・ギャラリー中央'},

  // Floor 2 (aligned to user's exact 2F PPT architectural coordinates)
  {id: 'junction:f2:core', type: 'junction', floor: 2, x: 631, y: 220, label: '中央連絡部'},
  {id: 'elevator:central:f2', type: 'elevator', floor: 2, x: 602.9, y: 205.1, label: 'リシュリュー中央エレベーター', facilityId: 'ev-richelieu-center'},
  {id: 'escalator:richelieu-center:f2', type: 'escalator', floor: 2, x: 631.4, y: 219.8, label: 'リシュリュー中央エスカレーター', facilityId: 'escalator-richelieu-center'},
  {id: 'elevator:richelieu-nw:f2', type: 'elevator', floor: 2, x: 561.0, y: 139.6, label: 'リシュリュー北西エレベーター', facilityId: 'ev-richelieu-nw'},
  {id: 'elevator:sully-north:f2', type: 'elevator', floor: 2, x: 837.1, y: 222.9, label: 'シュリー北エレベーター', facilityId: 'ev-sully-north'},
  {id: 'elevator:sully-west:f2', type: 'elevator', floor: 2, x: 781.9, y: 266.5, label: 'シュリー西エレベーター', facilityId: 'ev-sully-west'},
  {id: 'elevator:sully-sw:f2', type: 'elevator', floor: 2, x: 810.4, y: 371.6, label: 'シュリー南西エレベーター', facilityId: 'ev-sully-sw'},
  {id: 'stairs:richelieu-nw:f2', type: 'stairs', floor: 2, x: 568.2, y: 128.5, label: 'リシュリュー北西階段', facilityId: 'stairs-richelieu-nw'},
  {id: 'stairs:sully-n-west:f2', type: 'stairs', floor: 2, x: 830.9, y: 237.1, label: 'シュリー北西階段', facilityId: 'stairs-sully-n-west'},
  {id: 'stairs:sully-n-east:f2', type: 'stairs', floor: 2, x: 869.2, y: 233.6, label: 'シュリー北中央階段', facilityId: 'stairs-sully-n-east'},
  {id: 'stairs:sully-ne:f2', type: 'stairs', floor: 2, x: 899.5, y: 236.2, label: 'シュリー北東階段', facilityId: 'stairs-sully-ne'},
  {id: 'stairs:sully-west-n:f2', type: 'stairs', floor: 2, x: 795.3, y: 277.2, label: 'シュリー西・北階段', facilityId: 'stairs-sully-west-n'},
  {id: 'stairs:sully-west-s:f2', type: 'stairs', floor: 2, x: 795.3, y: 309.3, label: 'シュリー西・南階段', facilityId: 'stairs-sully-west-s'},
  {id: 'stairs:sully-se:f2', type: 'stairs', floor: 2, x: 912.8, y: 355.6, label: 'シュリー南東階段', facilityId: 'stairs-sully-se'},
  {id: 'junction:f2:richelieu', type: 'junction', floor: 2, x: 588, y: 208, label: 'リシュリュー翼連絡部'},
  {id: 'junction:f2:sully-west', type: 'junction', floor: 2, x: 730, y: 232, label: 'シュリー翼連絡部（830室）'},
  {id: 'junction:f2:sully-north', type: 'junction', floor: 2, x: 805, y: 237, label: 'シュリー翼北回廊'},
  {id: 'junction:f2:sully-east', type: 'junction', floor: 2, x: 917, y: 312, label: 'シュリー翼東回廊'}
];

const DOOR_POSITIONS = {
  '-1': {
    '102': {x: 515, y: 172},
    '105': {x: 626, y: 171},
    '169': {x: 481, y: 415},
    '170': {x: 615, y: 372}
  },
  '0': {
    '227': {x: 696, y: 127},
    '229': {x: 704, y: 158},
    '234': {x: 695, y: 225},
    '338': {x: 859, y: 361},
    '344': {x: 829, y: 364},
    '345': {x: 796, y: 364},
    '348': {x: 796, y: 333},
    '403': {x: 520, y: 370},
    '300': {x: 796, y: 262},
    '321': {x: 916, y: 277}
  },
  '1': {
    '501': {x: 589, y: 174},
    '502': {x: 589, y: 164},
    '507': {x: 636, y: 133},
    '544': {x: 489, y: 220},
    '605': {x: 806, y: 238},
    '635': {x: 916, y: 280},
    '663': {x: 796, y: 336},
    '700': {x: 520, y: 369},
    '701': {x: 558, y: 368},
    '702': {x: 605, y: 369},
    '703': {x: 703, y: 367},
    '708': {x: 682, y: 475},
    '710': {x: 603, y: 475},
    '711': {x: 558, y: 423},
    '712': {x: 512, y: 475},
    '716': {x: 342, y: 475},
    '718': {x: 155, y: 450},
    '505': {x: 589, y: 140},
    '617': {x: 852, y: 237},
    '633': {x: 916, y: 260},
    '636': {x: 916, y: 308},
    '640': {x: 916, y: 335},
    '641': {x: 893, y: 362}
  },
  '2': {
    '801': {x: 588, y: 171},
    '814': {x: 664, y: 133},
    '818': {x: 683, y: 189},
    '824': {x: 680, y: 133},
    '825': {x: 696, y: 133},
    '837': {x: 545, y: 213},
    '844': {x: 492, y: 182},
    '912': {x: 805, y: 237},
    '917': {x: 915, y: 264},
    '919': {x: 915, y: 282},
    '929': {x: 915, y: 350},
    '931': {x: 893, y: 365},
    '940': {x: 831, y: 365}
  }
};

const edges = [
  // Floor -2 (verified Hall Napoléon stairs & elevator)
  {from: 'entrance:pyramid:fm2', to: 'junction:fm2:core', cost: 8, kind: 'corridor', available: true},
  {from: 'junction:fm2:core', to: 'stairs:pyramid-n:fm2', cost: 6, kind: 'corridor', available: true},
  {from: 'junction:fm2:core', to: 'stairs:pyramid-e:fm2', cost: 6, kind: 'corridor', available: true},
  {from: 'junction:fm2:core', to: 'stairs:pyramid-s:fm2', cost: 6, kind: 'corridor', available: true},
  {from: 'junction:fm2:core', to: 'elevator:hall-napoleon-east:fm2', cost: 10, kind: 'corridor', via: [[620, 325]], available: true},

  // Floor -1 (walks cleanly through Hall Napoléon Y-concourse & all confirmed -2F--1F-0F facilities)
  {from: 'stairs:pyramid-n:fm1', to: 'junction:fm1:richelieu', cost: 7, kind: 'corridor', available: true},
  {from: 'stairs:pyramid-n:fm1', to: 'junction:fm1:core', cost: 4, kind: 'corridor', available: true},
  {from: 'stairs:pyramid-e:fm1', to: 'junction:fm1:core', cost: 2, kind: 'corridor', available: true},
  {from: 'stairs:pyramid-e:fm1', to: 'elevator:hall-napoleon-east:fm1', cost: 6, kind: 'corridor', available: true},
  {from: 'elevator:hall-napoleon-east:fm1', to: 'junction:fm1:sully', cost: 11, kind: 'corridor', available: true},
  {from: 'stairs:pyramid-s:fm1', to: 'junction:fm1:core', cost: 4, kind: 'corridor', available: true},
  {from: 'stairs:pyramid-s:fm1', to: 'junction:fm1:denon', cost: 7, kind: 'corridor', available: true},
  {from: 'elevator:central:fm1', to: 'junction:fm1:richelieu', cost: 4, kind: 'corridor', available: true},
  {from: 'escalator:richelieu-center:fm1', to: 'junction:fm1:richelieu', cost: 4, kind: 'corridor', available: true},
  {from: 'escalator:richelieu-center:fm1', to: 'stairs:richelieu-se:fm1', cost: 9, kind: 'corridor', available: true},
  {from: 'junction:fm1:core', to: 'junction:fm1:richelieu', cost: 12, kind: 'corridor', via: [[584, 299], [562, 260]], available: true},
  {from: 'junction:fm1:richelieu', to: 'door:fm1:102', cost: 6, kind: 'corridor', via: [[562, 172]], available: true},
  {from: 'door:fm1:102', to: 'elevator:richelieu-nw:fm1', cost: 3, kind: 'corridor', available: true},
  {from: 'door:fm1:102', to: 'stairs:richelieu-102-n:fm1', cost: 3, kind: 'corridor', available: true},
  {from: 'door:fm1:102', to: 'stairs:richelieu-102-s:fm1', cost: 3, kind: 'corridor', available: true},
  {from: 'door:fm1:102', to: 'door:fm1:105', cost: 9, kind: 'corridor', available: true},
  {from: 'junction:fm1:core', to: 'junction:fm1:sully', cost: 16, kind: 'corridor', available: true},
  {from: 'junction:fm1:sully', to: 'stairs:sully-west-n:fm1', cost: 3, kind: 'corridor', available: true},
  {from: 'junction:fm1:sully', to: 'stairs:sully-west-s:fm1', cost: 3, kind: 'corridor', available: true},
  {from: 'stairs:sully-west-n:fm1', to: 'elevator:sully-west:fm1', cost: 4, kind: 'corridor', available: true},
  {from: 'junction:fm1:sully', to: 'stairs:sully-338:fm1', cost: 12, kind: 'corridor', via: [[855, 299]], available: true},
  {from: 'stairs:sully-338:fm1', to: 'elevator:sully-se:fm1', cost: 4, kind: 'corridor', available: true},
  {from: 'junction:fm1:core', to: 'junction:fm1:denon', cost: 12, kind: 'corridor', via: [[584, 299], [562, 336]], available: true},
  {from: 'junction:fm1:denon', to: 'elevator:denon-center-nw:fm1', cost: 3, kind: 'corridor', available: true},
  {from: 'junction:fm1:denon', to: 'elevator:denon-center-ne:fm1', cost: 3, kind: 'corridor', available: true},
  {from: 'junction:fm1:denon', to: 'elevator:denon-center-w:fm1', cost: 3, kind: 'corridor', available: true},
  {from: 'junction:fm1:denon', to: 'elevator:denon-center-e:fm1', cost: 3, kind: 'corridor', available: true},
  {from: 'junction:fm1:denon', to: 'stairs:denon-403-e:fm1', cost: 3, kind: 'corridor', available: true},
  {from: 'junction:fm1:denon', to: 'stairs:denon-406-w:fm1', cost: 3, kind: 'corridor', available: true},
  {from: 'junction:fm1:denon', to: 'stairs:denon-405-n:fm1', cost: 4, kind: 'corridor', available: true},
  {from: 'stairs:denon-405-n:fm1', to: 'stairs:denon-405-s:fm1', cost: 5, kind: 'corridor', available: true},
  {from: 'junction:fm1:denon', to: 'door:fm1:169', cost: 10, kind: 'corridor', via: [[484, 372]], available: true},
  {from: 'door:fm1:169', to: 'elevator:denon-west:fm1', cost: 3, kind: 'corridor', available: true},
  {from: 'door:fm1:169', to: 'stairs:denon-west:fm1', cost: 5, kind: 'corridor', available: true},
  {from: 'door:fm1:169', to: 'stairs:denon-402-s:fm1', cost: 2, kind: 'corridor', available: true},
  {from: 'junction:fm1:denon', to: 'door:fm1:170', cost: 6, kind: 'corridor', available: true},
  {from: 'door:fm1:170', to: 'stairs:daru:fm1', cost: 5, kind: 'corridor', available: true},
  {from: 'door:fm1:169', to: 'door:fm1:170', cost: 14, kind: 'corridor', via: [[484, 372], [562, 372]], available: true},

  // Floor 0 (walks cleanly through the 0F PPT rooms, doorways & all verified -1F-0F-1F facilities)
  {from: 'elevator:central:f0', to: 'junction:f0:core', cost: 3, kind: 'corridor', available: true},
  {from: 'escalator:richelieu-center:f0', to: 'junction:f0:core', cost: 1, kind: 'corridor', available: true},
  {from: 'stairs:richelieu-102-n:f0', to: 'stairs:richelieu-102-s:f0', cost: 4, kind: 'corridor', available: true},
  {from: 'stairs:richelieu-102-s:f0', to: 'junction:f0:core', cost: 13, kind: 'corridor', via: [[550, 214]], available: true},
  {from: 'stairs:richelieu-102-n:f0', to: 'stairs:richelieu-nw:f0', cost: 7, kind: 'corridor', via: [[540, 130]], available: true},
  {from: 'junction:f0:core', to: 'junction:f0:richelieu', cost: 8, kind: 'corridor', via: [[658, 214]], available: true},
  {from: 'junction:f0:core', to: 'elevator:richelieu-nw:f0', cost: 14, kind: 'corridor', via: [[600, 140]], available: true},
  {from: 'junction:f0:core', to: 'stairs:richelieu-nw:f0', cost: 14, kind: 'corridor', via: [[600, 130]], available: true},
  {from: 'junction:f0:richelieu', to: 'door:f0:234', cost: 4, kind: 'corridor', available: true},
  {from: 'door:f0:234', to: 'stairs:richelieu-se:f0', cost: 2, kind: 'corridor', available: true},
  {from: 'junction:f0:richelieu', to: 'door:f0:229', cost: 8, kind: 'corridor', via: [[681, 158]], available: true},
  {from: 'door:f0:229', to: 'door:f0:227', cost: 5, kind: 'corridor', available: true},
  {from: 'door:f0:234', to: 'junction:f0:sully', cost: 14, kind: 'corridor', via: [[731, 232], [796, 238]], available: true},
  {from: 'door:f0:234', to: 'elevator:sully-west:f0', cost: 10, kind: 'corridor', via: [[731, 232], [796, 238]], available: true},
  {from: 'door:f0:234', to: 'stairs:sully-west-n:f0', cost: 10, kind: 'corridor', via: [[731, 232], [796, 238]], available: true},
  {from: 'door:f0:234', to: 'stairs:sully-n-west:f0', cost: 12, kind: 'corridor', via: [[731, 232], [796, 238]], available: true},
  {from: 'stairs:sully-n-west:f0', to: 'elevator:sully-north:f0', cost: 2, kind: 'corridor', available: true},
  {from: 'stairs:sully-n-west:f0', to: 'stairs:sully-n-east:f0', cost: 5, kind: 'corridor', available: true},
  {from: 'stairs:sully-n-east:f0', to: 'elevator:sully-ne:f0', cost: 4, kind: 'corridor', available: true},
  {from: 'elevator:sully-ne:f0', to: 'stairs:sully-ne-lower:f0', cost: 4, kind: 'corridor', available: true},
  {from: 'stairs:sully-ne-lower:f0', to: 'elevator:sully-se:f0', cost: 8, kind: 'corridor', via: [[915, 280]], available: true},
  // Added 2026-11-23 (door inserted on the corridor above; original edge kept, costs sum >= original)
  {from: 'stairs:sully-ne-lower:f0', to: 'door:f0:321', cost: 4, kind: 'corridor', available: true},
  {from: 'door:f0:321', to: 'elevator:sully-se:f0', cost: 4, kind: 'corridor', via: [[915, 280]], available: true},
  {from: 'elevator:sully-se:f0', to: 'stairs:sully-se:f0', cost: 8, kind: 'corridor', via: [[915, 335]], available: true},
  {from: 'stairs:sully-west-n:f0', to: 'stairs:sully-west-s:f0', cost: 4, kind: 'corridor', available: true},
  {from: 'elevator:sully-west:f0', to: 'junction:f0:sully', cost: 6, kind: 'corridor', via: [[796, 290]], available: true},
  {from: 'stairs:sully-west-s:f0', to: 'junction:f0:sully', cost: 2, kind: 'corridor', available: true},
  {from: 'junction:f0:core', to: 'junction:f0:sully', cost: 16, kind: 'corridor', via: [[731, 232], [796, 238]], available: true},
  // Added 2026-11-23 (door inserted on the corridor above; original edge kept, costs sum >= original)
  {from: 'junction:f0:core', to: 'door:f0:300', cost: 13, kind: 'corridor', via: [[731, 232], [796, 238]], available: true},
  {from: 'door:f0:300', to: 'junction:f0:sully', cost: 4, kind: 'corridor', available: true},
  {from: 'junction:f0:sully', to: 'door:f0:348', cost: 4, kind: 'corridor', available: true},
  {from: 'door:f0:348', to: 'door:f0:345', cost: 5, kind: 'corridor', available: true},
  {from: 'door:f0:345', to: 'elevator:sully-sw:f0', cost: 4, kind: 'corridor', available: true},
  {from: 'elevator:sully-sw:f0', to: 'door:f0:344', cost: 3, kind: 'corridor', available: true},
  {from: 'door:f0:345', to: 'door:f0:344', cost: 5, kind: 'corridor', available: true},
  {from: 'door:f0:344', to: 'door:f0:338', cost: 6, kind: 'corridor', available: true},
  {from: 'door:f0:338', to: 'stairs:sully-338:f0', cost: 1, kind: 'corridor', available: true},
  {from: 'door:f0:338', to: 'stairs:sully-se:f0', cost: 8, kind: 'corridor', via: [[890, 364]], available: true},
  {from: 'junction:f0:core', to: 'junction:f0:denon', cost: 16, kind: 'corridor', via: [[558, 290]], available: true},
  {from: 'junction:f0:denon', to: 'door:f0:403', cost: 5, kind: 'corridor', available: true},
  {from: 'door:f0:403', to: 'stairs:denon-west:f0', cost: 4, kind: 'corridor', available: true},
  {from: 'stairs:denon-west:f0', to: 'elevator:denon-west:f0', cost: 2, kind: 'corridor', available: true},
  {from: 'elevator:denon-west:f0', to: 'stairs:denon-402-s:f0', cost: 8, kind: 'corridor', available: true},
  {from: 'junction:f0:denon', to: 'stairs:denon-403-e:f0', cost: 2, kind: 'corridor', available: true},
  {from: 'junction:f0:denon', to: 'stairs:denon-406-w:f0', cost: 2, kind: 'corridor', available: true},
  {from: 'junction:f0:denon', to: 'elevator:denon-center-nw:f0', cost: 3, kind: 'corridor', available: true},
  {from: 'junction:f0:denon', to: 'elevator:denon-center-ne:f0', cost: 3, kind: 'corridor', available: true},
  {from: 'junction:f0:denon', to: 'elevator:denon-center-w:f0', cost: 3, kind: 'corridor', available: true},
  {from: 'junction:f0:denon', to: 'elevator:denon-center-e:f0', cost: 3, kind: 'corridor', available: true},
  {from: 'junction:f0:denon', to: 'stairs:denon-405-n:f0', cost: 3, kind: 'corridor', available: true},
  {from: 'stairs:denon-405-n:f0', to: 'stairs:denon-405-s:f0', cost: 7, kind: 'corridor', available: true},
  {from: 'junction:f0:denon', to: 'stairs:daru-west:f0', cost: 9, kind: 'corridor', available: true},
  {from: 'stairs:daru-west:f0', to: 'stairs:daru-east:f0', cost: 5, kind: 'corridor', available: true},
  {from: 'stairs:daru-east:f0', to: 'door:f0:345', cost: 11, kind: 'corridor', via: [[733, 367], [762, 359]], available: true},
  {from: 'junction:f0:denon', to: 'door:f0:345', cost: 18, kind: 'corridor', via: [[664, 369], [733, 367], [762, 359]], available: true},
  {from: 'elevator:denon-farwest:f0', to: 'stairs:denon-farwest:f0', cost: 2, kind: 'corridor', available: true},

  // Floor 1 (walks cleanly through the 1F PPT rooms, doorways & verified 0F-1F-2F facilities)
  {from: 'escalator:richelieu-center:f1', to: 'junction:f1:core', cost: 1, kind: 'corridor', available: true},
  {from: 'elevator:central:f1', to: 'junction:f1:core', cost: 3, kind: 'corridor', available: true},
  {from: 'elevator:central:f1', to: 'junction:f1:richelieu', cost: 2, kind: 'corridor', available: true},
  {from: 'junction:f1:core', to: 'junction:f1:richelieu', cost: 6, kind: 'corridor', via: [[610, 220]], available: true},
  {from: 'junction:f1:core', to: 'stairs:richelieu-se:f1', cost: 8, kind: 'corridor', via: [[686, 220]], available: true},
  {from: 'stairs:richelieu-se:f1', to: 'door:f1:605', cost: 8, kind: 'corridor', via: [[731, 232], [760, 232]], available: true},
  {from: 'junction:f1:richelieu', to: 'door:f1:501', cost: 4, kind: 'corridor', available: true},
  {from: 'door:f1:501', to: 'door:f1:502', cost: 3, kind: 'corridor', available: true},
  {from: 'door:f1:502', to: 'door:f1:507', cost: 8, kind: 'corridor', via: [[589, 133]], available: true},
  // Added 2026-11-23 (door inserted on the corridor above; original edge kept, costs sum >= original)
  {from: 'door:f1:502', to: 'door:f1:505', cost: 3, kind: 'corridor', available: true},
  {from: 'door:f1:505', to: 'door:f1:507', cost: 5, kind: 'corridor', via: [[589, 133]], available: true},
  {from: 'door:f1:502', to: 'elevator:richelieu-nw:f1', cost: 5, kind: 'corridor', via: [[589, 133]], available: true},
  {from: 'door:f1:502', to: 'stairs:richelieu-nw:f1', cost: 5, kind: 'corridor', via: [[589, 133]], available: true},
  {from: 'door:f1:507', to: 'stairs:richelieu-nw:f1', cost: 6, kind: 'corridor', via: [[589, 133]], available: true},
  {from: 'junction:f1:richelieu', to: 'door:f1:544', cost: 12, kind: 'corridor', via: [[536, 214]], available: true},
  {from: 'junction:f1:core', to: 'door:f1:605', cost: 14, kind: 'corridor', via: [[686, 220], [731, 232], [760, 232]], available: true},
  {from: 'door:f1:605', to: 'junction:f1:sully', cost: 12, kind: 'corridor', via: [[796, 262]], available: true},
  {from: 'door:f1:605', to: 'elevator:sully-west:f1', cost: 5, kind: 'corridor', via: [[796, 262]], available: true},
  {from: 'door:f1:605', to: 'stairs:sully-west-n:f1', cost: 5, kind: 'corridor', via: [[796, 262]], available: true},
  {from: 'stairs:sully-west-n:f1', to: 'stairs:sully-west-s:f1', cost: 4, kind: 'corridor', available: true},
  {from: 'elevator:sully-west:f1', to: 'junction:f1:sully', cost: 6, kind: 'corridor', via: [[796, 290]], available: true},
  {from: 'stairs:sully-west-s:f1', to: 'junction:f1:sully', cost: 2, kind: 'corridor', available: true},
  {from: 'junction:f1:sully', to: 'door:f1:663', cost: 4, kind: 'corridor', available: true},
  {from: 'door:f1:605', to: 'stairs:sully-n-west:f1', cost: 4, kind: 'corridor', available: true},
  {from: 'stairs:sully-n-west:f1', to: 'elevator:sully-north:f1', cost: 2, kind: 'corridor', available: true},
  {from: 'stairs:sully-n-west:f1', to: 'stairs:sully-n-east:f1', cost: 5, kind: 'corridor', available: true},
  // Added 2026-11-23 (door inserted on the corridor above; original edge kept, costs sum >= original)
  {from: 'stairs:sully-n-west:f1', to: 'door:f1:617', cost: 3, kind: 'corridor', available: true},
  {from: 'door:f1:617', to: 'stairs:sully-n-east:f1', cost: 2, kind: 'corridor', available: true},
  {from: 'stairs:sully-n-east:f1', to: 'stairs:sully-ne:f1', cost: 4, kind: 'corridor', available: true},
  {from: 'stairs:sully-ne:f1', to: 'elevator:sully-ne:f1', cost: 2, kind: 'corridor', available: true},
  {from: 'stairs:sully-ne:f1', to: 'stairs:sully-ne-lower:f1', cost: 3, kind: 'corridor', available: true},
  {from: 'stairs:sully-ne-lower:f1', to: 'door:f1:635', cost: 5, kind: 'corridor', available: true},
  // Added 2026-11-23 (door inserted on the corridor above; original edge kept, costs sum >= original)
  {from: 'stairs:sully-ne-lower:f1', to: 'door:f1:633', cost: 2, kind: 'corridor', available: true},
  {from: 'door:f1:633', to: 'door:f1:635', cost: 3, kind: 'corridor', available: true},
  {from: 'stairs:sully-ne:f1', to: 'door:f1:635', cost: 6, kind: 'corridor', via: [[916, 241]], available: true},
  {from: 'door:f1:605', to: 'door:f1:635', cost: 18, kind: 'corridor', via: [[852, 237], [916, 237]], available: true},
  {from: 'door:f1:635', to: 'stairs:sully-se:f1', cost: 9, kind: 'corridor', via: [[916, 362]], available: true},
  // Added 2026-11-23 (door inserted on the corridor above; original edge kept, costs sum >= original)
  {from: 'door:f1:635', to: 'door:f1:636', cost: 3, kind: 'corridor', available: true},
  {from: 'door:f1:636', to: 'door:f1:640', cost: 3, kind: 'corridor', available: true},
  {from: 'door:f1:640', to: 'stairs:sully-se:f1', cost: 3, kind: 'corridor', via: [[916, 362]], available: true},
  {from: 'stairs:sully-se:f1', to: 'elevator:sully-sw:f1', cost: 10, kind: 'corridor', via: [[870, 362]], available: true},
  // Added 2026-11-23 (door inserted on the corridor above; original edge kept, costs sum >= original)
  {from: 'stairs:sully-se:f1', to: 'door:f1:641', cost: 2, kind: 'corridor', available: true},
  {from: 'door:f1:641', to: 'elevator:sully-sw:f1', cost: 8, kind: 'corridor', via: [[870, 362]], available: true},
  {from: 'elevator:sully-sw:f1', to: 'door:f1:663', cost: 5, kind: 'corridor', via: [[796, 362]], available: true},
  {from: 'door:f1:663', to: 'door:f1:635', cost: 18, kind: 'corridor', via: [[796, 367], [916, 367]], available: true},
  {from: 'door:f1:663', to: 'junction:f1:denon-east', cost: 10, kind: 'corridor', via: [[796, 367], [760, 363], [733, 367]], available: true},
  {from: 'junction:f1:core', to: 'junction:f1:denon-east', cost: 16, kind: 'corridor', via: [[664, 300], [664, 367]], available: true},
  {from: 'junction:f1:denon-east', to: 'door:f1:703', cost: 2, kind: 'corridor', available: true},
  {from: 'door:f1:703', to: 'stairs:daru:f1', cost: 5, kind: 'corridor', available: true},
  {from: 'stairs:daru:f1', to: 'door:f1:702', cost: 6, kind: 'corridor', available: true},
  {from: 'door:f1:703', to: 'door:f1:708', cost: 9, kind: 'corridor', via: [[707, 422], [707, 475]], available: true},
  {from: 'door:f1:708', to: 'door:f1:710', cost: 8, kind: 'corridor', available: true},
  {from: 'door:f1:703', to: 'door:f1:702', cost: 10, kind: 'corridor', via: [[664, 367]], available: true},
  {from: 'door:f1:702', to: 'junction:f1:denon-center', cost: 6, kind: 'corridor', available: true},
  {from: 'junction:f1:denon-center', to: 'door:f1:701', cost: 2, kind: 'corridor', available: true},
  {from: 'junction:f1:denon-center', to: 'elevator:denon-center-w:f1', cost: 3, kind: 'corridor', available: true},
  {from: 'junction:f1:denon-center', to: 'elevator:denon-center-e:f1', cost: 3, kind: 'corridor', available: true},
  {from: 'junction:f1:denon-center', to: 'door:f1:700', cost: 5, kind: 'corridor', available: true},
  {from: 'door:f1:700', to: 'stairs:denon-west:f1', cost: 4, kind: 'corridor', available: true},
  {from: 'stairs:denon-west:f1', to: 'elevator:denon-west:f1', cost: 2, kind: 'corridor', available: true},
  {from: 'junction:f1:denon-center', to: 'door:f1:711', cost: 5, kind: 'corridor', available: true},
  {from: 'door:f1:711', to: 'junction:f1:grande-galerie', cost: 5, kind: 'corridor', available: true},
  {from: 'junction:f1:grande-galerie', to: 'door:f1:710', cost: 6, kind: 'corridor', available: true},
  {from: 'junction:f1:grande-galerie', to: 'door:f1:712', cost: 6, kind: 'corridor', available: true},
  {from: 'door:f1:712', to: 'door:f1:716', cost: 12, kind: 'corridor', available: true},
  {from: 'door:f1:716', to: 'door:f1:718', cost: 14, kind: 'corridor', via: [[208, 475], [208, 450]], available: true},
  {from: 'door:f1:718', to: 'elevator:denon-farwest:f1', cost: 5, kind: 'corridor', available: true},
  {from: 'door:f1:718', to: 'stairs:denon-farwest:f1', cost: 6, kind: 'corridor', via: [[117, 454]], available: true},
  {from: 'door:f1:703', to: 'door:f1:663', cost: 10, kind: 'corridor', via: [[733, 367], [796, 367]], available: true},

  // Floor 2 (walks cleanly through the 2F PPT rooms, doorways & verified 1F-2F facilities)
  {from: 'escalator:richelieu-center:f2', to: 'junction:f2:core', cost: 1, kind: 'corridor', available: true},
  {from: 'elevator:central:f2', to: 'junction:f2:core', cost: 3, kind: 'corridor', available: true},
  {from: 'elevator:central:f2', to: 'junction:f2:richelieu', cost: 2, kind: 'corridor', available: true},
  {from: 'junction:f2:core', to: 'junction:f2:richelieu', cost: 6, kind: 'corridor', via: [[608, 220]], available: true},
  {from: 'junction:f2:richelieu', to: 'door:f2:837', cost: 6, kind: 'corridor', available: true},
  {from: 'door:f2:837', to: 'door:f2:844', cost: 8, kind: 'corridor', via: [[502, 213]], available: true},
  {from: 'door:f2:844', to: 'elevator:richelieu-nw:f2', cost: 8, kind: 'corridor', via: [[502, 133]], available: true},
  {from: 'door:f2:844', to: 'stairs:richelieu-nw:f2', cost: 8, kind: 'corridor', via: [[502, 133]], available: true},
  {from: 'junction:f2:richelieu', to: 'door:f2:801', cost: 5, kind: 'corridor', available: true},
  {from: 'door:f2:801', to: 'elevator:richelieu-nw:f2', cost: 5, kind: 'corridor', via: [[588, 133]], available: true},
  {from: 'door:f2:801', to: 'stairs:richelieu-nw:f2', cost: 5, kind: 'corridor', via: [[588, 133]], available: true},
  {from: 'door:f2:801', to: 'door:f2:814', cost: 9, kind: 'corridor', via: [[588, 133], [629, 133]], available: true},
  {from: 'junction:f2:core', to: 'door:f2:818', cost: 7, kind: 'corridor', via: [[683, 220]], available: true},
  {from: 'door:f2:818', to: 'door:f2:814', cost: 7, kind: 'corridor', via: [[683, 152]], available: true},
  {from: 'door:f2:814', to: 'door:f2:824', cost: 3, kind: 'corridor', available: true},
  {from: 'door:f2:824', to: 'door:f2:825', cost: 3, kind: 'corridor', available: true},
  {from: 'door:f2:825', to: 'junction:f2:sully-west', cost: 11, kind: 'corridor', via: [[730, 133]], available: true},
  {from: 'junction:f2:core', to: 'junction:f2:sully-west', cost: 10, kind: 'corridor', via: [[685, 220], [685, 232]], available: true},
  {from: 'junction:f2:sully-west', to: 'junction:f2:sully-north', cost: 8, kind: 'corridor', via: [[759, 232]], available: true},
  {from: 'junction:f2:sully-north', to: 'door:f2:912', cost: 2, kind: 'corridor', available: true},
  {from: 'door:f2:912', to: 'elevator:sully-west:f2', cost: 5, kind: 'corridor', via: [[796, 262]], available: true},
  {from: 'door:f2:912', to: 'stairs:sully-west-n:f2', cost: 5, kind: 'corridor', via: [[796, 262]], available: true},
  {from: 'stairs:sully-west-n:f2', to: 'stairs:sully-west-s:f2', cost: 4, kind: 'corridor', available: true},
  {from: 'elevator:sully-west:f2', to: 'stairs:sully-west-s:f2', cost: 5, kind: 'corridor', available: true},
  {from: 'stairs:sully-west-s:f2', to: 'elevator:sully-sw:f2', cost: 8, kind: 'corridor', via: [[796, 365]], available: true},
  {from: 'elevator:sully-sw:f2', to: 'door:f2:940', cost: 3, kind: 'corridor', available: true},
  {from: 'door:f2:912', to: 'stairs:sully-n-west:f2', cost: 4, kind: 'corridor', available: true},
  {from: 'stairs:sully-n-west:f2', to: 'elevator:sully-north:f2', cost: 2, kind: 'corridor', available: true},
  {from: 'stairs:sully-n-west:f2', to: 'stairs:sully-n-east:f2', cost: 5, kind: 'corridor', available: true},
  {from: 'stairs:sully-n-east:f2', to: 'stairs:sully-ne:f2', cost: 4, kind: 'corridor', available: true},
  {from: 'stairs:sully-ne:f2', to: 'door:f2:917', cost: 5, kind: 'corridor', via: [[915, 237]], available: true},
  {from: 'door:f2:912', to: 'door:f2:917', cost: 12, kind: 'corridor', via: [[915, 237]], available: true},
  {from: 'door:f2:917', to: 'door:f2:919', cost: 4, kind: 'corridor', available: true},
  {from: 'door:f2:919', to: 'junction:f2:sully-east', cost: 6, kind: 'corridor', available: true},
  {from: 'junction:f2:sully-east', to: 'door:f2:929', cost: 6, kind: 'corridor', available: true},
  {from: 'door:f2:929', to: 'stairs:sully-se:f2', cost: 2, kind: 'corridor', available: true},
  {from: 'stairs:sully-se:f2', to: 'door:f2:931', cost: 4, kind: 'corridor', via: [[915, 365]], available: true},
  {from: 'door:f2:929', to: 'door:f2:931', cost: 5, kind: 'corridor', via: [[915, 365]], available: true},
  {from: 'door:f2:931', to: 'door:f2:940', cost: 10, kind: 'corridor', available: true},

  // Verified -2F <-> -1F vertical connections (3 Pyramid Stairs + 1 Hall Napoléon East Elevator)
  {from: 'stairs:pyramid-n:fm2', to: 'stairs:pyramid-n:fm1', cost: 18, kind: 'stairs', facilityId: 'stairs-pyramid-n', available: true},
  {from: 'stairs:pyramid-e:fm2', to: 'stairs:pyramid-e:fm1', cost: 18, kind: 'stairs', facilityId: 'stairs-pyramid-e', available: true},
  {from: 'stairs:pyramid-s:fm2', to: 'stairs:pyramid-s:fm1', cost: 18, kind: 'stairs', facilityId: 'stairs-pyramid-s', available: true},
  {from: 'elevator:hall-napoleon-east:fm2', to: 'elevator:hall-napoleon-east:fm1', cost: 22, kind: 'elevator', facilityId: 'ev-hall-napoleon-east', available: true},

  // Verified -1F <-> 0F vertical connections (9 EV + 1 Escalator + 13 Stairs)
  {from: 'elevator:richelieu-nw:fm1', to: 'elevator:richelieu-nw:f0', cost: 22, kind: 'elevator', facilityId: 'ev-richelieu-nw', available: true},
  {from: 'elevator:central:fm1', to: 'elevator:central:f0', cost: 22, kind: 'elevator', facilityId: 'ev-richelieu-center', available: true},
  {from: 'elevator:sully-west:fm1', to: 'elevator:sully-west:f0', cost: 22, kind: 'elevator', facilityId: 'ev-sully-west', available: true},
  {from: 'elevator:sully-se:fm1', to: 'elevator:sully-se:f0', cost: 22, kind: 'elevator', facilityId: 'ev-sully-se', available: true},
  {from: 'elevator:denon-west:fm1', to: 'elevator:denon-west:f0', cost: 22, kind: 'elevator', facilityId: 'ev-denon-west', available: true},
  {from: 'elevator:denon-center-nw:fm1', to: 'elevator:denon-center-nw:f0', cost: 22, kind: 'elevator', facilityId: 'ev-denon-center-nw', available: true},
  {from: 'elevator:denon-center-ne:fm1', to: 'elevator:denon-center-ne:f0', cost: 22, kind: 'elevator', facilityId: 'ev-denon-center-ne', available: true},
  {from: 'elevator:denon-center-w:fm1', to: 'elevator:denon-center-w:f0', cost: 22, kind: 'elevator', facilityId: 'ev-denon-center-w', available: true},
  {from: 'elevator:denon-center-e:fm1', to: 'elevator:denon-center-e:f0', cost: 22, kind: 'elevator', facilityId: 'ev-denon-center-e', available: true},
  {from: 'escalator:richelieu-center:fm1', to: 'escalator:richelieu-center:f0', cost: 16, kind: 'escalator', facilityId: 'escalator-richelieu-center', available: true},
  {from: 'stairs:richelieu-102-n:fm1', to: 'stairs:richelieu-102-n:f0', cost: 18, kind: 'stairs', facilityId: 'stairs-richelieu-102-n', available: true},
  {from: 'stairs:richelieu-102-s:fm1', to: 'stairs:richelieu-102-s:f0', cost: 18, kind: 'stairs', facilityId: 'stairs-richelieu-102-s', available: true},
  {from: 'stairs:richelieu-se:fm1', to: 'stairs:richelieu-se:f0', cost: 18, kind: 'stairs', facilityId: 'stairs-richelieu-se', available: true},
  {from: 'stairs:sully-west-n:fm1', to: 'stairs:sully-west-n:f0', cost: 18, kind: 'stairs', facilityId: 'stairs-sully-west-n', available: true},
  {from: 'stairs:sully-west-s:fm1', to: 'stairs:sully-west-s:f0', cost: 18, kind: 'stairs', facilityId: 'stairs-sully-west-s', available: true},
  {from: 'stairs:sully-338:fm1', to: 'stairs:sully-338:f0', cost: 18, kind: 'stairs', facilityId: 'stairs-sully-338', available: true},
  {from: 'stairs:daru:fm1', to: 'stairs:daru-west:f0', cost: 18, kind: 'stairs', facilityId: 'stairs-daru', available: true},
  {from: 'stairs:denon-west:fm1', to: 'stairs:denon-west:f0', cost: 18, kind: 'stairs', facilityId: 'stairs-denon-west', available: true},
  {from: 'stairs:denon-403-e:fm1', to: 'stairs:denon-403-e:f0', cost: 18, kind: 'stairs', facilityId: 'stairs-denon-403-e', available: true},
  {from: 'stairs:denon-406-w:fm1', to: 'stairs:denon-406-w:f0', cost: 18, kind: 'stairs', facilityId: 'stairs-denon-406-w', available: true},
  {from: 'stairs:denon-402-s:fm1', to: 'stairs:denon-402-s:f0', cost: 18, kind: 'stairs', facilityId: 'stairs-denon-402-s', available: true},
  {from: 'stairs:denon-405-n:fm1', to: 'stairs:denon-405-n:f0', cost: 18, kind: 'stairs', facilityId: 'stairs-denon-405-n', available: true},
  {from: 'stairs:denon-405-s:fm1', to: 'stairs:denon-405-s:f0', cost: 18, kind: 'stairs', facilityId: 'stairs-denon-405-s', available: true},

  // Verified 0F <-> 1F vertical connections (10 EV + 1 Escalator + 12 stair edges across 11 stair shafts)
  {from: 'escalator:richelieu-center:f0', to: 'escalator:richelieu-center:f1', cost: 16, kind: 'escalator', facilityId: 'escalator-richelieu-center', available: true},
  {from: 'stairs:sully-n-west:f0', to: 'stairs:sully-n-west:f1', cost: 18, kind: 'stairs', facilityId: 'stairs-sully-n-west', available: true},
  {from: 'stairs:sully-n-east:f0', to: 'stairs:sully-n-east:f1', cost: 18, kind: 'stairs', facilityId: 'stairs-sully-n-east', available: true},
  {from: 'elevator:richelieu-nw:f0', to: 'elevator:richelieu-nw:f1', cost: 22, kind: 'elevator', facilityId: 'ev-richelieu-nw', available: true},
  {from: 'elevator:central:f0', to: 'elevator:central:f1', cost: 22, kind: 'elevator', facilityId: 'ev-richelieu-center', available: true},
  {from: 'elevator:sully-north:f0', to: 'elevator:sully-north:f1', cost: 22, kind: 'elevator', facilityId: 'ev-sully-north', available: true},
  {from: 'elevator:sully-ne:f0', to: 'elevator:sully-ne:f1', cost: 22, kind: 'elevator', facilityId: 'ev-sully-ne', available: true},
  {from: 'elevator:sully-west:f0', to: 'elevator:sully-west:f1', cost: 22, kind: 'elevator', facilityId: 'ev-sully-west', available: true},
  {from: 'elevator:sully-sw:f0', to: 'elevator:sully-sw:f1', cost: 22, kind: 'elevator', facilityId: 'ev-sully-sw', available: true},
  {from: 'elevator:denon-west:f0', to: 'elevator:denon-west:f1', cost: 22, kind: 'elevator', facilityId: 'ev-denon-west', available: true},
  {from: 'elevator:denon-center-w:f0', to: 'elevator:denon-center-w:f1', cost: 22, kind: 'elevator', facilityId: 'ev-denon-center-w', available: true},
  {from: 'elevator:denon-center-e:f0', to: 'elevator:denon-center-e:f1', cost: 22, kind: 'elevator', facilityId: 'ev-denon-center-e', available: true},
  {from: 'elevator:denon-farwest:f0', to: 'elevator:denon-farwest:f1', cost: 22, kind: 'elevator', facilityId: 'ev-denon-farwest', available: true},
  {from: 'stairs:richelieu-nw:f0', to: 'stairs:richelieu-nw:f1', cost: 18, kind: 'stairs', facilityId: 'stairs-richelieu-nw', available: true},
  {from: 'stairs:richelieu-se:f0', to: 'stairs:richelieu-se:f1', cost: 18, kind: 'stairs', facilityId: 'stairs-richelieu-se', available: true},
  {from: 'stairs:sully-ne-lower:f0', to: 'stairs:sully-ne-lower:f1', cost: 18, kind: 'stairs', facilityId: 'stairs-sully-ne-lower', available: true},
  {from: 'stairs:sully-west-n:f0', to: 'stairs:sully-west-n:f1', cost: 18, kind: 'stairs', facilityId: 'stairs-sully-west-n', available: true},
  {from: 'stairs:sully-west-s:f0', to: 'stairs:sully-west-s:f1', cost: 18, kind: 'stairs', facilityId: 'stairs-sully-west-s', available: true},
  {from: 'stairs:sully-se:f0', to: 'stairs:sully-se:f1', cost: 18, kind: 'stairs', facilityId: 'stairs-sully-se', available: true},
  {from: 'stairs:daru-west:f0', to: 'stairs:daru:f1', cost: 18, kind: 'stairs', facilityId: 'stairs-daru', available: true},
  {from: 'stairs:daru-east:f0', to: 'stairs:daru:f1', cost: 18, kind: 'stairs', facilityId: 'stairs-daru', available: true},
  {from: 'stairs:denon-west:f0', to: 'stairs:denon-west:f1', cost: 18, kind: 'stairs', facilityId: 'stairs-denon-west', available: true},
  {from: 'stairs:denon-farwest:f0', to: 'stairs:denon-farwest:f1', cost: 18, kind: 'stairs', facilityId: 'stairs-denon-farwest', available: true},

  // Verified 1F <-> 2F vertical connections (5 EV + 1 Escalator + 7 Stairs)
  {from: 'elevator:richelieu-nw:f1', to: 'elevator:richelieu-nw:f2', cost: 22, kind: 'elevator', facilityId: 'ev-richelieu-nw', available: true},
  {from: 'elevator:central:f1', to: 'elevator:central:f2', cost: 22, kind: 'elevator', facilityId: 'ev-richelieu-center', available: true},
  {from: 'elevator:sully-north:f1', to: 'elevator:sully-north:f2', cost: 22, kind: 'elevator', facilityId: 'ev-sully-north', available: true},
  {from: 'elevator:sully-west:f1', to: 'elevator:sully-west:f2', cost: 22, kind: 'elevator', facilityId: 'ev-sully-west', available: true},
  {from: 'elevator:sully-sw:f1', to: 'elevator:sully-sw:f2', cost: 22, kind: 'elevator', facilityId: 'ev-sully-sw', available: true},
  {from: 'escalator:richelieu-center:f1', to: 'escalator:richelieu-center:f2', cost: 16, kind: 'escalator', facilityId: 'escalator-richelieu-center', available: true},
  {from: 'stairs:richelieu-nw:f1', to: 'stairs:richelieu-nw:f2', cost: 18, kind: 'stairs', facilityId: 'stairs-richelieu-nw', available: true},
  {from: 'stairs:sully-n-west:f1', to: 'stairs:sully-n-west:f2', cost: 18, kind: 'stairs', facilityId: 'stairs-sully-n-west', available: true},
  {from: 'stairs:sully-n-east:f1', to: 'stairs:sully-n-east:f2', cost: 18, kind: 'stairs', facilityId: 'stairs-sully-n-east', available: true},
  {from: 'stairs:sully-ne:f1', to: 'stairs:sully-ne:f2', cost: 18, kind: 'stairs', facilityId: 'stairs-sully-ne', available: true},
  {from: 'stairs:sully-west-n:f1', to: 'stairs:sully-west-n:f2', cost: 18, kind: 'stairs', facilityId: 'stairs-sully-west-n', available: true},
  {from: 'stairs:sully-west-s:f1', to: 'stairs:sully-west-s:f2', cost: 18, kind: 'stairs', facilityId: 'stairs-sully-west-s', available: true},
  {from: 'stairs:sully-se:f1', to: 'stairs:sully-se:f2', cost: 18, kind: 'stairs', facilityId: 'stairs-sully-se', available: true}
];

// Add room door nodes
for (const [fStr, roomMap] of Object.entries(DOOR_POSITIONS)) {
  const floor = Number(fStr);
  for (const [room, pos] of Object.entries(roomMap)) {
    const anchor = ROOM_ANCHORS[fStr][room];
    const wingCap = {richelieu: 'Richelieu', sully: 'Sully', denon: 'Denon'}[anchor.wing] || anchor.wing;
    nodes.push({
      id: `door:${floorTag(floor)}:${room}`,
      type: 'room',
      room,
      floor,
      wing: wingCap,
      x: pos.x,
      y: pos.y,
      label: `${room}室前`
    });
  }
}

// Add artwork nodes for all 60 mapped works
let artworkCount = 0;
for (const work of works) {
  if (work.locationPrecision !== 'room' || work.room == null || work.floor == null) continue;
  const fStr = String(work.floor);
  const anchor = ROOM_ANCHORS[fStr]?.[String(work.room)];
  if (!anchor) continue;
  const doorId = `door:${floorTag(work.floor)}:${work.room}`;
  const workNodeId = `work:${work.id}`;
  nodes.push({
    id: workNodeId,
    type: 'artwork',
    workId: work.id,
    room: String(work.room),
    floor: work.floor,
    x: anchor.x,
    y: anchor.y,
    label: work.title,
    exitNodeId: doorId
  });
  edges.push({from: workNodeId, to: doorId, cost: 4, kind: 'room-access', available: true});
  artworkCount += 1;
}

const navGraph = {
  meta: {
    version: 3,
    status: 'osm-geojson-aligned',
    checkedAt: '2026-11-20',
    note: '全5階層の公式準拠GeoJSON建築座標に合わせて生成した廊下・階段・エレベーター・展示室・作品の接続グラフ。',
    futureFilters: ['available', 'kind', 'closedSectionId']
  },
  roomNotices: [],
  nodes,
  edges
};

fs.writeFileSync(navOutPath, JSON.stringify(navGraph, null, 2) + '\n', 'utf8');

const geoSizeKB = (fs.statSync(outGeoPath).size / 1024).toFixed(1);
console.log(`Built src/floor-map-geo.js (${geoSizeKB} KB) & src/navigation-graph.json (nodes=${nodes.length}, edges=${edges.length}, artworks=${artworkCount})`);
for (const f of FLOORS) {
  const fl = floorsOutput[String(f)];
  console.log(`  Floor ${f}: rooms=${fl.rooms.length}, corridors=${fl.corridors.length}, walls=${fl.walls.length}, doors=${fl.doors.length}, facilities=${fl.facilities.length}, labels=${fl.roomLabels.length}`);
}
