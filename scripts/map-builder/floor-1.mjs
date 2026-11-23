// Build custom exact Floor 1 architectural plan from the user's PPT map (same 1024x429 -> 960x600 grid!)
export function buildCustomFloor1Plan({round1, FLOOR_SUBTITLES, ROOM_ANCHORS}) {
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
