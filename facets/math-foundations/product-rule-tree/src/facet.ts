import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

/**
 * @piece
 * 질문: 자리 셋을 차례로 고를 때 가능한 결과의 수는 왜 선택지 수를 더한 것이 아니라 곱한 것인가.
 *
 * 한 자리를 고를 때마다 지금 있는 끝 하나하나에서 그 자리의 선택지 수만큼 갈래가 돋는다.
 * 모든 끝이 같은 수의 갈래를 받으므로 끝의 수가 1 → 3 → 6 → 18 로 곱해진다.
 */
export const productRuleTreeFacet: FacetJson = {
  id: 'facet:productRuleTree',
  title: {
    en: 'Multiply at every branch',
    ko: '갈래마다 곱한다',
    ja: '枝分かれごとに掛ける',
    zh: '每次分支都相乘',
    ar: 'اضرب عند كل تفرّع',
    es: 'Multiplica en cada rama',
    fr: 'Multiplier à chaque embranchement',
    hi: 'हर शाखा पर गुणा करो',
    id: 'Kalikan di setiap cabang',
    pt: 'Multiplique a cada ramificação',
  },
  description: {
    en: 'Choosing one place at a time, every current end grows the same number of branches, so the count of ends is multiplied, not added.',
    ko: '자리를 하나씩 고를 때마다 지금의 끝 하나하나에서 같은 수의 갈래가 돋아, 끝의 수가 더해지지 않고 곱해진다.',
    ja: '位置を一つずつ選ぶたびに、今あるすべての端から同じ数の枝が伸びるので、端の数は足されるのではなく掛けられる。',
    zh: '每次选定一个位置，当前的每个末端都长出同样数目的分支，所以末端的数目是相乘而不是相加。',
    ar: 'عند اختيار خانة في كل مرة، ينبت من كل طرف حالي العدد نفسه من الفروع، فيُضرب عدد الأطراف ولا يُجمع.',
    es: 'Al elegir una posición cada vez, de cada extremo actual brota el mismo número de ramas, así que el número de extremos se multiplica, no se suma.',
    fr: 'À chaque position choisie, chaque extrémité actuelle reçoit le même nombre de branches : le nombre d’extrémités se multiplie au lieu de s’additionner.',
    hi: 'हर बार एक स्थान चुनने पर हर मौजूदा सिरे से उतनी ही शाखाएँ निकलती हैं, इसलिए सिरों की संख्या जुड़ती नहीं, गुणा होती है।',
    id: 'Setiap kali satu posisi dipilih, setiap ujung saat ini menumbuhkan cabang dengan jumlah yang sama, sehingga banyak ujung dikalikan, bukan dijumlahkan.',
    pt: 'A cada posição escolhida, cada extremidade atual ganha o mesmo número de ramos, então o número de extremidades é multiplicado, não somado.',
  },
  algorithm: 'module:productRuleTree',
  scene: 'module:productRuleTreeScene',
  initialData: {
    type: 'product-rule-tree',
    stepMs: 2400,
    places: [
      ['A', 'B', 'C'],
      ['x', 'y'],
      ['1', '2', '3'],
    ],
  },
  shuffleOnReset: false,
  messages: {
    'label.place1': {
      en: 'First place',
      ko: '첫째 자리',
      ja: '1番目の位置',
      zh: '第一位',
      ar: 'الخانة الأولى',
      es: 'Primera posición',
      fr: 'Première position',
      hi: 'पहला स्थान',
      id: 'Posisi pertama',
      pt: 'Primeira posição',
    },
    'label.place2': {
      en: 'Second place',
      ko: '둘째 자리',
      ja: '2番目の位置',
      zh: '第二位',
      ar: 'الخانة الثانية',
      es: 'Segunda posición',
      fr: 'Deuxième position',
      hi: 'दूसरा स्थान',
      id: 'Posisi kedua',
      pt: 'Segunda posição',
    },
    'label.place3': {
      en: 'Third place',
      ko: '셋째 자리',
      ja: '3番目の位置',
      zh: '第三位',
      ar: 'الخانة الثالثة',
      es: 'Tercera posición',
      fr: 'Troisième position',
      hi: 'तीसरा स्थान',
      id: 'Posisi ketiga',
      pt: 'Terceira posição',
    },
    'caption.start': {
      en: 'Nothing chosen yet. Ends: {n}',
      ko: '아직 아무것도 고르지 않았다. 끝: {n}',
      ja: 'まだ何も選んでいない。端: {n}',
      zh: '还什么都没选。末端: {n}',
      ar: 'لم يُختر شيء بعد. الأطراف: {n}',
      es: 'Aún no se ha elegido nada. Extremos: {n}',
      fr: 'Rien n’est encore choisi. Extrémités : {n}',
      hi: 'अभी कुछ नहीं चुना। सिरे: {n}',
      id: 'Belum ada yang dipilih. Ujung: {n}',
      pt: 'Nada escolhido ainda. Extremidades: {n}',
    },
    'caption.branch': {
      en: '{place}: ends {before} × {choices} = {after}',
      ko: '{place}: 끝 {before} × {choices} = {after}',
      ja: '{place}: 端 {before} × {choices} = {after}',
      zh: '{place}: 末端 {before} × {choices} = {after}',
      ar: '{place}: الأطراف {before} × {choices} = {after}',
      es: '{place}: extremos {before} × {choices} = {after}',
      fr: '{place} : extrémités {before} × {choices} = {after}',
      hi: '{place}: सिरे {before} × {choices} = {after}',
      id: '{place}: ujung {before} × {choices} = {after}',
      pt: '{place}: extremidades {before} × {choices} = {after}',
    },
  },
  blocks: {
    stage: { type: 'product-rule-tree-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
};
