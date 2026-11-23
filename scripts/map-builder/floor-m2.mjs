// Build custom exact Floor -2 architectural plan from the user's PPT map (1024x506 -> exact same 960x600 palace frame!)
export function buildCustomFloorM2Plan({round1, FLOOR_SUBTITLES}) {
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
