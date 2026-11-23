// Build custom exact Floor 0 architectural plan from the user's PPT map (same 1024x429 -> 960x600 grid!)
export function buildCustomFloor0Plan({round1, FLOOR_SUBTITLES, ROOM_ANCHORS}) {
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
