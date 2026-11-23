// Build custom exact Floor -1 architectural plan from the user's PPT map (1024x506 -> exact same 960x600 palace frame!)
export function buildCustomFloorM1Plan({round1, FLOOR_SUBTITLES, ROOM_ANCHORS}) {
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
