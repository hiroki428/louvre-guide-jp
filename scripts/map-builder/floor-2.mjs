// Build custom exact Floor 2 architectural plan from the user's PPT map (1024x429 -> 960x600)
export function buildCustomFloor2Plan({round1, FLOOR_SUBTITLES, ROOM_ANCHORS}) {
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
