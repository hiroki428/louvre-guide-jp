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
    '102': {x: 461, y: 162, wing: 'richelieu', name: 'マルリーの中庭'},
    '105': {x: 560, y: 162, wing: 'richelieu', name: 'ピュジェの中庭'},
    '169': {x: 444, y: 448, wing: 'denon', name: '彫刻展示室'},
    '170': {x: 545, y: 495, wing: 'denon', name: '先古典期ギリシア'}
  },
  '0': {
    '227': {x: 598, y: 132, wing: 'richelieu', name: 'ハンムラビ法典の間'},
    '229': {x: 564, y: 132, wing: 'richelieu', name: 'コルサバードの中庭'},
    '234': {x: 525, y: 127, wing: 'richelieu', name: 'メソポタミア'},
    '338': {x: 790, y: 428, wing: 'sully', name: 'スフィンクスの地下室'},
    '344': {x: 726, y: 442, wing: 'sully', name: 'ギリシア古典彫刻'},
    '345': {x: 681, y: 442, wing: 'sully', name: 'ミロのヴィーナスの間'},
    '348': {x: 681, y: 396, wing: 'sully', name: 'カリアティードの間'},
    '403': {x: 438, y: 432, wing: 'denon', name: 'ミケランジェロ・ギャラリー'}
  },
  '1': {
    '501': {x: 461, y: 173, wing: 'richelieu', name: 'シャルルマーニュの間'},
    '502': {x: 462, y: 151, wing: 'richelieu', name: 'シュジェールの間'},
    '507': {x: 559, y: 125, wing: 'richelieu', name: 'マクシミリアンの狩猟ギャラリー'},
    '544': {x: 344, y: 170, wing: 'richelieu', name: 'ナポレオン三世の居室'},
    '605': {x: 678, y: 208, wing: 'sully', name: '18世紀装飾美術'},
    '635': {x: 907, y: 295, wing: 'sully', name: '古代エジプト美術'},
    '663': {x: 688, y: 370, wing: 'sully', name: 'ブロンズの間'},
    '700': {x: 403, y: 431, wing: 'denon', name: 'モリアン室'},
    '701': {x: 456, y: 424, wing: 'denon', name: 'ドゥノン室'},
    '702': {x: 513, y: 437, wing: 'denon', name: 'ダリュ室'},
    '703': {x: 620, y: 447, wing: 'denon', name: 'ダリュの階段踊り場'},
    '708': {x: 605, y: 521, wing: 'denon', name: 'サロン・カレ'},
    '710': {x: 510, y: 521, wing: 'denon', name: 'グラン・ギャラリー東'},
    '711': {x: 457, y: 487, wing: 'denon', name: '諸国の間'},
    '712': {x: 380, y: 521, wing: 'denon', name: 'グラン・ギャラリー中央'},
    '716': {x: 290, y: 521, wing: 'denon', name: 'グラン・ギャラリー西'},
    '718': {x: 145, y: 502, wing: 'denon', name: 'スペイン絵画'}
  },
  '2': {
    '801': {x: 462, y: 162, wing: 'richelieu', name: 'メディシス・ギャラリー'},
    '814': {x: 568, y: 114, wing: 'richelieu', name: '北方ルネサンス'},
    '818': {x: 572, y: 175, wing: 'richelieu', name: 'フランドル絵画'},
    '824': {x: 587, y: 118, wing: 'richelieu', name: 'フォンテーヌブロー派'},
    '825': {x: 604, y: 116, wing: 'richelieu', name: 'プッサンの間'},
    '837': {x: 401, y: 190, wing: 'richelieu', name: 'フェルメールの間'},
    '844': {x: 338, y: 157, wing: 'richelieu', name: 'レンブラントの間'},
    '912': {x: 752, y: 204, wing: 'sully', name: '17世紀フランス絵画'},
    '917': {x: 846, y: 204, wing: 'sully', name: '18世紀フランス絵画'},
    '919': {x: 907, y: 252, wing: 'sully', name: 'ルイ15世時代の絵画'},
    '929': {x: 907, y: 375, wing: 'sully', name: 'フラゴナールの間'},
    '931': {x: 895, y: 428, wing: 'sully', name: 'ロココ絵画'},
    '940': {x: 770, y: 428, wing: 'sully', name: 'アングルの間'}
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

const geoData = {
  meta: {
    source: 'OpenStreetMap Louvre indoor GeoJSON (floors -2 to 2)',
    viewBox: {x: 0, y: 0, width: VIEW_W, height: VIEW_H},
    rotationDeg: 19.631,
    generatedAt: '2026-11-20'
  },
  footprintPolys,
  floors: floorsOutput
};

fs.writeFileSync(outGeoPath, `export const floorGeoData = ${JSON.stringify(geoData)};\n`, 'utf8');

// ==================== REBUILD NAVIGATION GRAPH ALIGNED TO GEOJSON ====================
const works = JSON.parse(fs.readFileSync(worksPath, 'utf8'));
const floorTag = f => (f < 0 ? `fm${Math.abs(f)}` : `f${f}`);

const nodes = [
  // Floor -2 (Hall Napoléon, real OSM coordinates)
  {id: 'entrance:pyramid:fm2', type: 'entrance', floor: -2, x: 441, y: 307, label: 'ピラミッド中央入口'},
  {id: 'junction:fm2:core', type: 'junction', floor: -2, x: 495, y: 322, label: 'ナポレオン・ホール中央'},
  {id: 'stairs:central:fm2', type: 'stairs', floor: -2, x: 536, y: 326, label: '中央階段', facilityId: 'stairs-central'},
  {id: 'elevator:central:fm2', type: 'elevator', floor: -2, x: 544, y: 336, label: '中央エレベーター', facilityId: 'elevator-central'},

  // Floor -1
  {id: 'junction:fm1:core', type: 'junction', floor: -1, x: 525, y: 325, label: '中央連絡部'},
  {id: 'stairs:central:fm1', type: 'stairs', floor: -1, x: 536, y: 326, label: '中央階段', facilityId: 'stairs-central'},
  {id: 'elevator:central:fm1', type: 'elevator', floor: -1, x: 544, y: 336, label: '中央エレベーター', facilityId: 'elevator-central'},
  {id: 'junction:fm1:richelieu', type: 'junction', floor: -1, x: 482, y: 187, label: 'リシュリュー翼連絡部'},
  {id: 'junction:fm1:denon', type: 'junction', floor: -1, x: 470, y: 449, label: 'ドゥノン翼連絡部'},

  // Floor 0
  {id: 'junction:f0:core', type: 'junction', floor: 0, x: 535, y: 315, label: '中央連絡部'},
  {id: 'stairs:central:f0', type: 'stairs', floor: 0, x: 536, y: 326, label: '中央階段', facilityId: 'stairs-central'},
  {id: 'elevator:central:f0', type: 'elevator', floor: 0, x: 544, y: 336, label: '中央エレベーター', facilityId: 'elevator-central'},
  {id: 'junction:f0:richelieu', type: 'junction', floor: 0, x: 535, y: 168, label: 'リシュリュー翼廊下'},
  {id: 'junction:f0:sully', type: 'junction', floor: 0, x: 666, y: 345, label: 'シュリー翼連絡部'},
  {id: 'junction:f0:denon', type: 'junction', floor: 0, x: 485, y: 432, label: 'ドゥノン翼廊下'},

  // Floor 1
  {id: 'junction:f1:core', type: 'junction', floor: 1, x: 535, y: 315, label: '中央連絡部'},
  {id: 'stairs:central:f1', type: 'stairs', floor: 1, x: 536, y: 326, label: '中央階段', facilityId: 'stairs-central'},
  {id: 'elevator:central:f1', type: 'elevator', floor: 1, x: 544, y: 336, label: '中央エレベーター', facilityId: 'elevator-central'},
  {id: 'junction:f1:richelieu', type: 'junction', floor: 1, x: 482, y: 187, label: 'リシュリュー翼連絡部'},
  {id: 'junction:f1:sully', type: 'junction', floor: 1, x: 666, y: 350, label: 'シュリー翼連絡部'},
  {id: 'junction:f1:denon-east', type: 'junction', floor: 1, x: 590, y: 447, label: 'ドゥノン翼東分岐'},
  {id: 'junction:f1:denon-center', type: 'junction', floor: 1, x: 457, y: 435, label: 'サロン・ドゥノン'},
  {id: 'junction:f1:grande-galerie', type: 'junction', floor: 1, x: 457, y: 521, label: 'グラン・ギャラリー中央'},

  // Floor 2
  {id: 'junction:f2:core', type: 'junction', floor: 2, x: 535, y: 270, label: '中央連絡部'},
  {id: 'stairs:central:f2', type: 'stairs', floor: 2, x: 536, y: 295, label: '中央階段', facilityId: 'stairs-central'},
  {id: 'elevator:central:f2', type: 'elevator', floor: 2, x: 544, y: 305, label: '中央エレベーター', facilityId: 'elevator-central'},
  {id: 'junction:f2:richelieu', type: 'junction', floor: 2, x: 482, y: 187, label: 'リシュリュー翼連絡部'},
  {id: 'junction:f2:sully-west', type: 'junction', floor: 2, x: 666, y: 281, label: 'シュリー翼西分岐'},
  {id: 'junction:f2:sully-north', type: 'junction', floor: 2, x: 752, y: 215, label: 'シュリー翼北回廊'},
  {id: 'junction:f2:sully-east', type: 'junction', floor: 2, x: 906, y: 312, label: 'シュリー翼東回廊'}
];

const DOOR_POSITIONS = {
  '-1': {
    '102': {x: 468, y: 176},
    '105': {x: 542, y: 176},
    '169': {x: 456, y: 448},
    '170': {x: 535, y: 495}
  },
  '0': {
    '227': {x: 598, y: 152},
    '229': {x: 564, y: 152},
    '234': {x: 525, y: 152},
    '338': {x: 780, y: 428},
    '344': {x: 726, y: 428},
    '345': {x: 676, y: 428},
    '348': {x: 676, y: 396},
    '403': {x: 450, y: 432}
  },
  '1': {
    '501': {x: 472, y: 187},
    '502': {x: 472, y: 162},
    '507': {x: 548, y: 145},
    '544': {x: 372, y: 187},
    '605': {x: 676, y: 225},
    '635': {x: 896, y: 295},
    '663': {x: 676, y: 370},
    '700': {x: 414, y: 435},
    '701': {x: 457, y: 435},
    '702': {x: 513, y: 441},
    '703': {x: 605, y: 447},
    '708': {x: 595, y: 512},
    '710': {x: 510, y: 521},
    '711': {x: 457, y: 472},
    '712': {x: 380, y: 521},
    '716': {x: 290, y: 521},
    '718': {x: 168, y: 512}
  },
  '2': {
    '801': {x: 472, y: 176},
    '814': {x: 568, y: 132},
    '818': {x: 556, y: 176},
    '824': {x: 587, y: 132},
    '825': {x: 604, y: 132},
    '837': {x: 418, y: 190},
    '844': {x: 360, y: 176},
    '912': {x: 752, y: 215},
    '917': {x: 846, y: 215},
    '919': {x: 906, y: 252},
    '929': {x: 906, y: 375},
    '931': {x: 895, y: 416},
    '940': {x: 785, y: 428}
  }
};

const edges = [
  // Floor -2
  {from: 'entrance:pyramid:fm2', to: 'junction:fm2:core', cost: 8, kind: 'corridor', available: true},
  {from: 'junction:fm2:core', to: 'stairs:central:fm2', cost: 6, kind: 'corridor', available: true},
  {from: 'junction:fm2:core', to: 'elevator:central:fm2', cost: 7, kind: 'corridor', available: true},

  // Floor -1
  {from: 'stairs:central:fm1', to: 'junction:fm1:core', cost: 3, kind: 'corridor', available: true},
  {from: 'elevator:central:fm1', to: 'junction:fm1:core', cost: 3, kind: 'corridor', available: true},
  {from: 'junction:fm1:core', to: 'junction:fm1:richelieu', cost: 16, kind: 'corridor', via: [[525, 220], [482, 220]], available: true},
  {from: 'junction:fm1:richelieu', to: 'door:fm1:102', cost: 4, kind: 'corridor', available: true},
  {from: 'door:fm1:102', to: 'door:fm1:105', cost: 9, kind: 'corridor', available: true},
  {from: 'junction:fm1:core', to: 'junction:fm1:denon', cost: 18, kind: 'corridor', via: [[525, 449]], available: true},
  {from: 'junction:fm1:denon', to: 'door:fm1:169', cost: 9, kind: 'corridor', via: [[470, 505]], available: true},
  {from: 'door:fm1:169', to: 'door:fm1:170', cost: 6, kind: 'corridor', available: true},

  // Floor 0
  {from: 'stairs:central:f0', to: 'junction:f0:core', cost: 3, kind: 'corridor', available: true},
  {from: 'elevator:central:f0', to: 'junction:f0:core', cost: 3, kind: 'corridor', available: true},
  {from: 'junction:f0:core', to: 'junction:f0:richelieu', cost: 16, kind: 'corridor', available: true},
  {from: 'junction:f0:richelieu', to: 'door:f0:229', cost: 5, kind: 'corridor', via: [[564, 168]], available: true},
  {from: 'door:f0:229', to: 'door:f0:227', cost: 5, kind: 'corridor', available: true},
  {from: 'junction:f0:richelieu', to: 'door:f0:234', cost: 4, kind: 'corridor', via: [[525, 168]], available: true},
  {from: 'junction:f0:core', to: 'junction:f0:sully', cost: 16, kind: 'corridor', via: [[666, 315]], available: true},
  {from: 'junction:f0:sully', to: 'door:f0:348', cost: 6, kind: 'corridor', available: true},
  {from: 'door:f0:348', to: 'door:f0:345', cost: 5, kind: 'corridor', available: true},
  {from: 'door:f0:345', to: 'door:f0:344', cost: 5, kind: 'corridor', available: true},
  {from: 'door:f0:344', to: 'door:f0:338', cost: 7, kind: 'corridor', available: true},
  {from: 'junction:f0:core', to: 'junction:f0:denon', cost: 16, kind: 'corridor', via: [[535, 432]], available: true},
  {from: 'junction:f0:denon', to: 'door:f0:403', cost: 6, kind: 'corridor', available: true},
  {from: 'junction:f0:denon', to: 'door:f0:345', cost: 22, kind: 'corridor', via: [[620, 432]], available: true},

  // Floor 1
  {from: 'stairs:central:f1', to: 'junction:f1:core', cost: 3, kind: 'corridor', available: true},
  {from: 'elevator:central:f1', to: 'junction:f1:core', cost: 3, kind: 'corridor', available: true},
  {from: 'junction:f1:core', to: 'junction:f1:richelieu', cost: 16, kind: 'corridor', via: [[535, 187]], available: true},
  {from: 'junction:f1:richelieu', to: 'door:f1:501', cost: 3, kind: 'corridor', available: true},
  {from: 'door:f1:501', to: 'door:f1:502', cost: 4, kind: 'corridor', available: true},
  {from: 'door:f1:502', to: 'door:f1:507', cost: 10, kind: 'corridor', via: [[515, 152]], available: true},
  {from: 'junction:f1:richelieu', to: 'door:f1:544', cost: 14, kind: 'corridor', available: true},
  {from: 'junction:f1:core', to: 'junction:f1:sully', cost: 15, kind: 'corridor', via: [[666, 315]], available: true},
  {from: 'junction:f1:sully', to: 'door:f1:605', cost: 14, kind: 'corridor', via: [[666, 250]], available: true},
  {from: 'junction:f1:sully', to: 'door:f1:663', cost: 4, kind: 'corridor', available: true},
  {from: 'door:f1:605', to: 'door:f1:635', cost: 20, kind: 'corridor', via: [[896, 204]], available: true},
  {from: 'door:f1:663', to: 'door:f1:635', cost: 20, kind: 'corridor', via: [[676, 434], [896, 434]], available: true},
  {from: 'junction:f1:core', to: 'junction:f1:denon-east', cost: 18, kind: 'corridor', via: [[590, 315]], available: true},
  {from: 'junction:f1:denon-east', to: 'door:f1:703', cost: 3, kind: 'corridor', available: true},
  {from: 'door:f1:703', to: 'door:f1:708', cost: 8, kind: 'corridor', via: [[605, 488]], available: true},
  {from: 'door:f1:708', to: 'door:f1:710', cost: 10, kind: 'corridor', available: true},
  {from: 'door:f1:703', to: 'door:f1:702', cost: 10, kind: 'corridor', via: [[560, 444]], available: true},
  {from: 'door:f1:702', to: 'junction:f1:denon-center', cost: 7, kind: 'corridor', available: true},
  {from: 'junction:f1:denon-center', to: 'door:f1:701', cost: 2, kind: 'corridor', available: true},
  {from: 'junction:f1:denon-center', to: 'door:f1:700', cost: 6, kind: 'corridor', available: true},
  {from: 'junction:f1:denon-center', to: 'door:f1:711', cost: 5, kind: 'corridor', available: true},
  {from: 'door:f1:711', to: 'junction:f1:grande-galerie', cost: 6, kind: 'corridor', available: true},
  {from: 'junction:f1:grande-galerie', to: 'door:f1:710', cost: 7, kind: 'corridor', available: true},
  {from: 'junction:f1:grande-galerie', to: 'door:f1:712', cost: 9, kind: 'corridor', available: true},
  {from: 'door:f1:712', to: 'door:f1:716', cost: 10, kind: 'corridor', available: true},
  {from: 'door:f1:716', to: 'door:f1:718', cost: 13, kind: 'corridor', via: [[200, 521]], available: true},
  {from: 'door:f1:703', to: 'door:f1:663', cost: 12, kind: 'corridor', via: [[676, 447]], available: true},

  // Floor 2
  {from: 'stairs:central:f2', to: 'junction:f2:core', cost: 4, kind: 'corridor', available: true},
  {from: 'elevator:central:f2', to: 'junction:f2:core', cost: 4, kind: 'corridor', available: true},
  {from: 'junction:f2:core', to: 'junction:f2:richelieu', cost: 12, kind: 'corridor', via: [[535, 187]], available: true},
  {from: 'junction:f2:richelieu', to: 'door:f2:837', cost: 8, kind: 'corridor', available: true},
  {from: 'door:f2:837', to: 'door:f2:844', cost: 8, kind: 'corridor', available: true},
  {from: 'junction:f2:richelieu', to: 'door:f2:801', cost: 4, kind: 'corridor', available: true},
  {from: 'junction:f2:richelieu', to: 'door:f2:818', cost: 9, kind: 'corridor', available: true},
  {from: 'door:f2:818', to: 'door:f2:814', cost: 7, kind: 'corridor', via: [[568, 176]], available: true},
  {from: 'door:f2:814', to: 'door:f2:824', cost: 4, kind: 'corridor', available: true},
  {from: 'door:f2:824', to: 'door:f2:825', cost: 3, kind: 'corridor', available: true},
  {from: 'junction:f2:core', to: 'junction:f2:sully-west', cost: 16, kind: 'corridor', via: [[666, 270]], available: true},
  {from: 'junction:f2:sully-west', to: 'junction:f2:sully-north', cost: 14, kind: 'corridor', via: [[666, 215]], available: true},
  {from: 'junction:f2:sully-north', to: 'door:f2:912', cost: 2, kind: 'corridor', available: true},
  {from: 'door:f2:912', to: 'door:f2:917', cost: 11, kind: 'corridor', available: true},
  {from: 'door:f2:917', to: 'door:f2:919', cost: 7, kind: 'corridor', via: [[906, 204]], available: true},
  {from: 'door:f2:919', to: 'junction:f2:sully-east', cost: 8, kind: 'corridor', available: true},
  {from: 'junction:f2:sully-east', to: 'door:f2:929', cost: 7, kind: 'corridor', available: true},
  {from: 'door:f2:929', to: 'door:f2:931', cost: 5, kind: 'corridor', available: true},
  {from: 'door:f2:931', to: 'door:f2:940', cost: 12, kind: 'corridor', via: [[895, 428]], available: true},

  // Vertical connections (stairs & elevator across all 5 floors)
  {from: 'stairs:central:fm2', to: 'stairs:central:fm1', cost: 18, kind: 'stairs', facilityId: 'stairs-central', available: true},
  {from: 'stairs:central:fm1', to: 'stairs:central:f0', cost: 18, kind: 'stairs', facilityId: 'stairs-central', available: true},
  {from: 'stairs:central:f0', to: 'stairs:central:f1', cost: 18, kind: 'stairs', facilityId: 'stairs-central', available: true},
  {from: 'stairs:central:f1', to: 'stairs:central:f2', cost: 18, kind: 'stairs', facilityId: 'stairs-central', available: true},
  {from: 'elevator:central:fm2', to: 'elevator:central:fm1', cost: 22, kind: 'elevator', facilityId: 'elevator-central', available: true},
  {from: 'elevator:central:fm1', to: 'elevator:central:f0', cost: 22, kind: 'elevator', facilityId: 'elevator-central', available: true},
  {from: 'elevator:central:f0', to: 'elevator:central:f1', cost: 22, kind: 'elevator', facilityId: 'elevator-central', available: true},
  {from: 'elevator:central:f1', to: 'elevator:central:f2', cost: 22, kind: 'elevator', facilityId: 'elevator-central', available: true}
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
