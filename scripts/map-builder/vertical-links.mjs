// Verified vertical facility correspondences across ALL 5 floors (-2F <-> -1F <-> 0F <-> 1F <-> 2F: 14 EV + 1 Escalator + 23 Stairs = 38 shafts)
export const verticalLinks = [
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
