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
    '403': {x: 520.1, y: 369.8, wing: 'denon', name: 'ミケランジェロ・ギャラリー'}
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
    '718': {x: 154.5, y: 450.0, wing: 'denon', name: 'スペイン絵画'}
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
    // Sully shared walls
    makeDivider(909, 132, 909, 157), // 912 | 913
    makeDivider(949, 132, 949, 157), // 913 | north corridor
    makeDivider(982, 132, 982, 157), // north corridor | NE corner
    makeDivider(988, 162, 1014, 162),// NE corner / 917
    makeDivider(988, 199, 1014, 199),// 917 / 924
    makeDivider(988, 259, 1014, 259),// 924 / 929
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
    ['924', 1003, 229],
    ['929', 1000.5, 271.5]
  ];

  const roomLabels = uniformLabelSpec.map(([number, x, y]) => {
    const [sx, sy] = p(x, y);
    return {number, x: sx, y: sy, priority: Boolean(ROOM_ANCHORS['2'][number]), uniform: true};
  });

  // Key Floor 2 facilities aligned to official 2F map & PPT geometry
  const facList = [
    {type: 'elevator', pt: p(576, 70), label: ''},
    {type: 'stairs', pt: p(682, 126), label: ''},
    {type: 'elevator', pt: p(668, 126), label: ''},
    {type: 'wc', pt: p(633, 146), label: ''},
    {type: 'wc', pt: p(808, 152), label: ''},
    {type: 'elevator', pt: p(826, 152), label: ''},
    {type: 'elevator', pt: p(904, 174), label: ''},
    {type: 'wc', pt: p(952, 252), label: ''},
    {type: 'elevator', pt: p(876, 312), label: ''}
  ].map(f => ({type: f.type, x: Math.round(f.pt[0]), y: Math.round(f.pt[1]), label: f.label}));

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
    ['535', 575.5, 118.5],
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
    ['632', 969.5, 145],
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
    ['720', 165, 354.5],
    ['734', 127, 414],
    ['727', 165.5, 414]
  ];

  const roomLabels = uniformLabelSpec.map(([number, x, y]) => {
    const [sx, sy] = p(x, y);
    return {number, x: sx, y: sy, priority: Boolean(ROOM_ANCHORS['1'][number]), uniform: true};
  });

  const facList = [
    {type: 'stairs', pt: p(682, 126), label: ''},
    {type: 'elevator', pt: p(668, 126), label: ''},
    {type: 'wc', pt: p(634, 152), label: ''},
    {type: 'cafe', pt: p(518, 286), label: 'カフェ'},
    {type: 'stairs', pt: p(518, 300), label: ''},
    {type: 'stairs', pt: p(718, 290), label: ''},
    {type: 'elevator', pt: p(562, 352), label: ''},
    {type: 'elevator', pt: p(652, 352), label: ''},
    {type: 'wc', pt: p(952, 252), label: ''},
    {type: 'elevator', pt: p(1005, 146), label: ''},
    {type: 'stairs', pt: p(1005, 288), label: ''}
  ].map(f => ({type: f.type, x: Math.round(f.pt[0]), y: Math.round(f.pt[1]), label: f.label}));

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
    makeRectRoom(815, 130, 838, 149, 'sully', '306'),
    makeRectRoom(846, 133, 906, 158, 'sully', '308'),
    makeRectRoom(846, 158, 887, 184, 'sully', '300'),
    makeRectRoom(910, 125, 950, 165, 'sully', '312'),
    makeRectRoom(954, 133, 989, 157, 'sully', '316'),
    makeRectRoom(989, 163, 1014, 178, 'sully', '317'),
    makeRectRoom(989, 178, 1014, 201, 'sully', '321'),
    makeRectRoom(984, 206, 1019, 229, 'sully', '324'),
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

    // Denon Wing — Under construction (工事中: 418, 417, 415)
    makeRectRoom(690, 309, 710, 401, 'denon', '418', {underConstruction: true}),
    makeRectRoom(690, 401, 785, 424, 'denon', '417', {underConstruction: true}),
    makeRectRoom(762, 308, 782, 397, 'denon', '415', {underConstruction: true})
  ];

  const passages = [
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
    makeDivider(785, 404, 808, 404)  // 410 / 413
  ];

  const courtyards = [
    {points: polyStr(rectPts(542, 313, 580, 400))},
    {points: polyStr(rectPts(620, 310, 685, 397))}
  ];

  // Unified medium-grey stair / facility halls (IDENTICAL cool-grey across ALL wings!)
  const serviceHalls = [
    {points: polyStr(rectPts(658, 105, 712, 147)), number: '', name: 'リシュリュー中央階段'},
    {points: polyStr(rectPts(846, 184, 887, 234)), number: '', name: 'シュリー西階段・連絡部'},
    {points: polyStr(rectPts(989, 130, 1022, 163)), number: '', name: 'シュリー北東階段'},
    {points: polyStr(rectPts(989, 272, 1022, 305)), number: '', name: 'シュリー南東階段'},
    {points: polyStr(rectPts(502, 274, 534, 311)), number: '', name: 'ドゥノン西階段'},
    {points: polyStr(rectPts(579, 275, 620, 315)), number: '', name: 'ドゥノン中央階段'},
    {points: polyStr(rectPts(690, 275, 745, 305)), number: '', name: 'ダリュ階段'}
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
    ['234', 753.5, 132.5],
    ['231', 793.5, 139.5],
    // Sully
    ['306', 826.5, 139.5],
    ['308', 876, 145.5],
    ['300', 866.5, 171],
    ['312', 930, 145],
    ['316', 971.5, 145],
    ['317', 1001.5, 170.5],
    ['321', 1001.5, 190],
    ['324', 1001.5, 217.5],
    ['328', 1001.5, 253],
    ['348', 866.5, 252.5],
    ['345', 866.5, 287.5],
    ['339', 904, 287.5],
    ['338', 937, 284],
    ['337', 970.5, 287.5],
    ['347', 829, 281.5],
    // Denon (incl. construction 418, 417, 415)
    ['403', 557, 294],
    ['406', 652.5, 292.5],
    ['408', 796.5, 290.5],
    ['400', 524, 322],
    ['402', 524, 362.5],
    ['405', 599, 353.5],
    ['418', 700, 355],
    ['419', 736.5, 352],
    ['415', 772, 352.5],
    ['417', 737.5, 412.5],
    ['410', 796.5, 356.5],
    ['413', 796.5, 414]
  ];

  const roomLabels = uniformLabelSpec.map(([number, x, y]) => {
    const [sx, sy] = p(x, y);
    return {number, x: sx, y: sy, priority: Boolean(ROOM_ANCHORS['0'][number]), uniform: true};
  });

  const facList = [
    {type: 'stairs', pt: p(685, 126), label: ''},
    {type: 'elevator', pt: p(671, 126), label: ''},
    {type: 'stairs', pt: p(518, 292), label: ''},
    {type: 'elevator', pt: p(599, 295), label: ''},
    {type: 'stairs', pt: p(718, 290), label: ''},
    {type: 'elevator', pt: p(1005, 146), label: ''},
    {type: 'stairs', pt: p(1005, 288), label: ''},
    {type: 'wc', pt: p(952, 252), label: ''}
  ].map(f => ({type: f.type, x: Math.round(f.pt[0]), y: Math.round(f.pt[1]), label: f.label}));

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
      {id: 'denon', label: 'ドゥノン翼', range: '400–419室', labelX: round1(X0 + 520 * S), labelY: 514}
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
    makeRectRoom(647, 425, 685, 435, 'denon', '180'),
    makeRectRoom(616, 439, 673, 452, 'denon', '181'),
    makeRectRoom(673, 439, 699, 452, 'denon', '179'),
    makeRectRoom(699, 368, 711, 446, 'denon', '175'),
    makeRectRoom(716, 386, 739, 403, 'denon', '174')
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
    {wing: 'denon', points: polyStr(rectPts(703, 360, 709, 370))},
    {wing: 'denon', points: polyStr(rectPts(649, 374, 655, 384))},
    {wing: 'denon', points: polyStr(rectPts(672, 374, 678, 384))},
    {wing: 'denon', points: polyStr(rectPts(629, 390, 638, 396))},
    {wing: 'denon', points: polyStr(rectPts(663, 433, 669, 441))}
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

  // Uniform-size room numbers covering EVERY numbered room from the user's -1F PPT map
  const uniformLabelSpec = [
    // Richelieu
    ['102', 551, 84.5],
    ['104', 606.5, 85],
    ['105', 676, 83],
    ['101', 551, 146],
    // Sully (Medieval Louvre)
    ['132', 906, 255.5],
    ['137', 906, 293],
    ['135', 944, 293],
    ['133', 985, 260],
    ['134', 1012.5, 283],
    // Denon
    ['164', 517, 350.5],
    ['169', 513.5, 406.5],
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

  const facList = [
    {type: 'escalator', pt: p(604, 175), label: ''},
    {type: 'stairs', pt: p(658, 136), label: ''},
    {type: 'elevator', pt: p(604, 348), label: ''},
    {type: 'stairs', pt: p(874, 254), label: ''},
    {type: 'wc', pt: p(552, 224), label: ''},
    {type: 'wc', pt: p(552, 282), label: ''},
    {type: 'cafe', pt: p(760, 224), label: 'カフェ'}
  ].map(f => ({type: f.type, x: Math.round(f.pt[0]), y: Math.round(f.pt[1]), label: f.label}));

  return {
    subtitle: FLOOR_SUBTITLES['-1'],
    isCustomFloorPlan: true,
    uniformRoomLabels: true,
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
      wingHeaders: [
        {label: 'リシュリュー翼', x: round1(X0 + 628 * Sx), y: 92},
        {label: 'シュリー翼', x: round1(X0 + 918 * Sx), y: 202},
        {label: 'ドゥノン翼', x: round1(X0 + 520 * Sx), y: 514}
      ]
    },
    wings: [
      {id: 'richelieu', label: 'リシュリュー翼', range: '101–105室', labelX: round1(X0 + 628 * Sx), labelY: 92},
      {id: 'sully', label: 'シュリー翼', range: '132–137室', labelX: round1(X0 + 918 * Sx), labelY: 202},
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

  // Floor -1 (aligned to user's exact -1F PPT architectural coordinates)
  {id: 'junction:fm1:core', type: 'junction', floor: -1, x: 562, y: 299, label: '中央連絡部'},
  {id: 'stairs:central:fm1', type: 'stairs', floor: -1, x: 562, y: 299, label: '中央階段', facilityId: 'stairs-central'},
  {id: 'elevator:central:fm1', type: 'elevator', floor: -1, x: 562, y: 312, label: '中央エレベーター', facilityId: 'elevator-central'},
  {id: 'junction:fm1:richelieu', type: 'junction', floor: -1, x: 562, y: 213, label: 'リシュリュー翼連絡部'},
  {id: 'junction:fm1:denon', type: 'junction', floor: -1, x: 562, y: 372, label: 'ドゥノン翼連絡部'},

  // Floor 0 (aligned to user's exact 0F PPT architectural coordinates)
  {id: 'junction:f0:core', type: 'junction', floor: 0, x: 634, y: 220, label: '中央連絡部'},
  {id: 'stairs:central:f0', type: 'stairs', floor: 0, x: 634, y: 220, label: '中央階段', facilityId: 'stairs-central'},
  {id: 'elevator:central:f0', type: 'elevator', floor: 0, x: 622, y: 220, label: '中央エレベーター', facilityId: 'elevator-central'},
  {id: 'junction:f0:richelieu', type: 'junction', floor: 0, x: 678, y: 206, label: 'リシュリュー翼廊下'},
  {id: 'junction:f0:sully', type: 'junction', floor: 0, x: 796, y: 312, label: 'シュリー翼連絡部'},
  {id: 'junction:f0:denon', type: 'junction', floor: 0, x: 558, y: 369, label: 'ドゥノン翼廊下'},

  // Floor 1 (aligned to user's exact 1F PPT architectural coordinates)
  {id: 'junction:f1:core', type: 'junction', floor: 1, x: 632, y: 220, label: '中央連絡部'},
  {id: 'stairs:central:f1', type: 'stairs', floor: 1, x: 632, y: 220, label: '中央階段', facilityId: 'stairs-central'},
  {id: 'elevator:central:f1', type: 'elevator', floor: 1, x: 620, y: 220, label: '中央エレベーター', facilityId: 'elevator-central'},
  {id: 'junction:f1:richelieu', type: 'junction', floor: 1, x: 589, y: 208, label: 'リシュリュー翼連絡部'},
  {id: 'junction:f1:sully', type: 'junction', floor: 1, x: 796, y: 315, label: 'シュリー翼連絡部'},
  {id: 'junction:f1:denon-east', type: 'junction', floor: 1, x: 703, y: 367, label: 'ドゥノン翼東分岐'},
  {id: 'junction:f1:denon-center', type: 'junction', floor: 1, x: 558, y: 368, label: 'サロン・ドゥノン'},
  {id: 'junction:f1:grande-galerie', type: 'junction', floor: 1, x: 558, y: 475, label: 'グラン・ギャラリー中央'},

  // Floor 2 (aligned to user's exact 2F PPT architectural coordinates)
  {id: 'junction:f2:core', type: 'junction', floor: 2, x: 631, y: 220, label: '中央連絡部'},
  {id: 'stairs:central:f2', type: 'stairs', floor: 2, x: 631, y: 220, label: '中央階段', facilityId: 'stairs-central'},
  {id: 'elevator:central:f2', type: 'elevator', floor: 2, x: 619, y: 220, label: '中央エレベーター', facilityId: 'elevator-central'},
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
    '403': {x: 520, y: 370}
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
    '718': {x: 155, y: 450}
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
  // Floor -2
  {from: 'entrance:pyramid:fm2', to: 'junction:fm2:core', cost: 8, kind: 'corridor', available: true},
  {from: 'junction:fm2:core', to: 'stairs:central:fm2', cost: 6, kind: 'corridor', available: true},
  {from: 'junction:fm2:core', to: 'elevator:central:fm2', cost: 7, kind: 'corridor', available: true},

  // Floor -1 (walks cleanly through Hall Napoléon Y-concourse & -1F rooms)
  {from: 'stairs:central:fm1', to: 'junction:fm1:core', cost: 2, kind: 'corridor', available: true},
  {from: 'elevator:central:fm1', to: 'junction:fm1:core', cost: 3, kind: 'corridor', available: true},
  {from: 'junction:fm1:core', to: 'junction:fm1:richelieu', cost: 12, kind: 'corridor', via: [[584, 299], [562, 260]], available: true},
  {from: 'junction:fm1:richelieu', to: 'door:fm1:102', cost: 6, kind: 'corridor', via: [[562, 172]], available: true},
  {from: 'door:fm1:102', to: 'door:fm1:105', cost: 9, kind: 'corridor', available: true},
  {from: 'junction:fm1:core', to: 'junction:fm1:denon', cost: 12, kind: 'corridor', via: [[584, 299], [562, 336]], available: true},
  {from: 'junction:fm1:denon', to: 'door:fm1:169', cost: 10, kind: 'corridor', via: [[484, 372]], available: true},
  {from: 'junction:fm1:denon', to: 'door:fm1:170', cost: 6, kind: 'corridor', available: true},
  {from: 'door:fm1:169', to: 'door:fm1:170', cost: 14, kind: 'corridor', via: [[484, 372], [562, 372]], available: true},

  // Floor 0 (walks cleanly through the 0F PPT rooms & doorways)
  {from: 'stairs:central:f0', to: 'junction:f0:core', cost: 2, kind: 'corridor', available: true},
  {from: 'elevator:central:f0', to: 'junction:f0:core', cost: 3, kind: 'corridor', available: true},
  {from: 'junction:f0:core', to: 'junction:f0:richelieu', cost: 8, kind: 'corridor', via: [[658, 214]], available: true},
  {from: 'junction:f0:richelieu', to: 'door:f0:234', cost: 4, kind: 'corridor', available: true},
  {from: 'junction:f0:richelieu', to: 'door:f0:229', cost: 8, kind: 'corridor', via: [[681, 158]], available: true},
  {from: 'door:f0:229', to: 'door:f0:227', cost: 5, kind: 'corridor', available: true},
  {from: 'door:f0:234', to: 'junction:f0:sully', cost: 14, kind: 'corridor', via: [[731, 232], [796, 238]], available: true},
  {from: 'junction:f0:core', to: 'junction:f0:sully', cost: 16, kind: 'corridor', via: [[731, 232], [796, 238]], available: true},
  {from: 'junction:f0:sully', to: 'door:f0:348', cost: 4, kind: 'corridor', available: true},
  {from: 'door:f0:348', to: 'door:f0:345', cost: 5, kind: 'corridor', available: true},
  {from: 'door:f0:345', to: 'door:f0:344', cost: 5, kind: 'corridor', available: true},
  {from: 'door:f0:344', to: 'door:f0:338', cost: 6, kind: 'corridor', available: true},
  {from: 'junction:f0:core', to: 'junction:f0:denon', cost: 16, kind: 'corridor', via: [[558, 290]], available: true},
  {from: 'junction:f0:denon', to: 'door:f0:403', cost: 5, kind: 'corridor', available: true},
  {from: 'junction:f0:denon', to: 'door:f0:345', cost: 18, kind: 'corridor', via: [[664, 369], [733, 367], [762, 359]], available: true},

  // Floor 1 (walks cleanly through the 1F PPT rooms & doorways)
  {from: 'stairs:central:f1', to: 'junction:f1:core', cost: 2, kind: 'corridor', available: true},
  {from: 'elevator:central:f1', to: 'junction:f1:core', cost: 3, kind: 'corridor', available: true},
  {from: 'junction:f1:core', to: 'junction:f1:richelieu', cost: 6, kind: 'corridor', via: [[610, 220]], available: true},
  {from: 'junction:f1:richelieu', to: 'door:f1:501', cost: 4, kind: 'corridor', available: true},
  {from: 'door:f1:501', to: 'door:f1:502', cost: 3, kind: 'corridor', available: true},
  {from: 'door:f1:502', to: 'door:f1:507', cost: 8, kind: 'corridor', via: [[589, 133]], available: true},
  {from: 'junction:f1:richelieu', to: 'door:f1:544', cost: 12, kind: 'corridor', via: [[536, 214]], available: true},
  {from: 'junction:f1:core', to: 'door:f1:605', cost: 14, kind: 'corridor', via: [[686, 220], [731, 232], [760, 232]], available: true},
  {from: 'door:f1:605', to: 'junction:f1:sully', cost: 12, kind: 'corridor', via: [[796, 262]], available: true},
  {from: 'junction:f1:sully', to: 'door:f1:663', cost: 4, kind: 'corridor', available: true},
  {from: 'door:f1:605', to: 'door:f1:635', cost: 18, kind: 'corridor', via: [[852, 237], [916, 237]], available: true},
  {from: 'door:f1:663', to: 'door:f1:635', cost: 18, kind: 'corridor', via: [[796, 367], [916, 367]], available: true},
  {from: 'door:f1:663', to: 'junction:f1:denon-east', cost: 10, kind: 'corridor', via: [[796, 367], [760, 363], [733, 367]], available: true},
  {from: 'junction:f1:core', to: 'junction:f1:denon-east', cost: 16, kind: 'corridor', via: [[664, 300], [664, 367]], available: true},
  {from: 'junction:f1:denon-east', to: 'door:f1:703', cost: 2, kind: 'corridor', available: true},
  {from: 'door:f1:703', to: 'door:f1:708', cost: 9, kind: 'corridor', via: [[707, 422], [707, 475]], available: true},
  {from: 'door:f1:708', to: 'door:f1:710', cost: 8, kind: 'corridor', available: true},
  {from: 'door:f1:703', to: 'door:f1:702', cost: 10, kind: 'corridor', via: [[664, 367]], available: true},
  {from: 'door:f1:702', to: 'junction:f1:denon-center', cost: 6, kind: 'corridor', available: true},
  {from: 'junction:f1:denon-center', to: 'door:f1:701', cost: 2, kind: 'corridor', available: true},
  {from: 'junction:f1:denon-center', to: 'door:f1:700', cost: 5, kind: 'corridor', available: true},
  {from: 'junction:f1:denon-center', to: 'door:f1:711', cost: 5, kind: 'corridor', available: true},
  {from: 'door:f1:711', to: 'junction:f1:grande-galerie', cost: 5, kind: 'corridor', available: true},
  {from: 'junction:f1:grande-galerie', to: 'door:f1:710', cost: 6, kind: 'corridor', available: true},
  {from: 'junction:f1:grande-galerie', to: 'door:f1:712', cost: 6, kind: 'corridor', available: true},
  {from: 'door:f1:712', to: 'door:f1:716', cost: 12, kind: 'corridor', available: true},
  {from: 'door:f1:716', to: 'door:f1:718', cost: 14, kind: 'corridor', via: [[208, 475], [208, 450]], available: true},
  {from: 'door:f1:703', to: 'door:f1:663', cost: 10, kind: 'corridor', via: [[733, 367], [796, 367]], available: true},

  // Floor 2 (walks cleanly through the 2F PPT rooms & doorways)
  {from: 'stairs:central:f2', to: 'junction:f2:core', cost: 2, kind: 'corridor', available: true},
  {from: 'elevator:central:f2', to: 'junction:f2:core', cost: 3, kind: 'corridor', available: true},
  {from: 'junction:f2:core', to: 'junction:f2:richelieu', cost: 6, kind: 'corridor', via: [[608, 220]], available: true},
  {from: 'junction:f2:richelieu', to: 'door:f2:837', cost: 6, kind: 'corridor', available: true},
  {from: 'door:f2:837', to: 'door:f2:844', cost: 8, kind: 'corridor', via: [[502, 213]], available: true},
  {from: 'junction:f2:richelieu', to: 'door:f2:801', cost: 5, kind: 'corridor', available: true},
  {from: 'door:f2:801', to: 'door:f2:814', cost: 9, kind: 'corridor', via: [[588, 133], [629, 133]], available: true},
  {from: 'junction:f2:core', to: 'door:f2:818', cost: 7, kind: 'corridor', via: [[683, 220]], available: true},
  {from: 'door:f2:818', to: 'door:f2:814', cost: 7, kind: 'corridor', via: [[683, 152]], available: true},
  {from: 'door:f2:814', to: 'door:f2:824', cost: 3, kind: 'corridor', available: true},
  {from: 'door:f2:824', to: 'door:f2:825', cost: 3, kind: 'corridor', available: true},
  {from: 'door:f2:825', to: 'junction:f2:sully-west', cost: 11, kind: 'corridor', via: [[730, 133]], available: true},
  {from: 'junction:f2:core', to: 'junction:f2:sully-west', cost: 10, kind: 'corridor', via: [[685, 220], [685, 232]], available: true},
  {from: 'junction:f2:sully-west', to: 'junction:f2:sully-north', cost: 8, kind: 'corridor', via: [[759, 232]], available: true},
  {from: 'junction:f2:sully-north', to: 'door:f2:912', cost: 2, kind: 'corridor', available: true},
  {from: 'door:f2:912', to: 'door:f2:917', cost: 12, kind: 'corridor', via: [[915, 237]], available: true},
  {from: 'door:f2:917', to: 'door:f2:919', cost: 4, kind: 'corridor', available: true},
  {from: 'door:f2:919', to: 'junction:f2:sully-east', cost: 6, kind: 'corridor', available: true},
  {from: 'junction:f2:sully-east', to: 'door:f2:929', cost: 6, kind: 'corridor', available: true},
  {from: 'door:f2:929', to: 'door:f2:931', cost: 5, kind: 'corridor', via: [[915, 365]], available: true},
  {from: 'door:f2:931', to: 'door:f2:940', cost: 10, kind: 'corridor', available: true},

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
