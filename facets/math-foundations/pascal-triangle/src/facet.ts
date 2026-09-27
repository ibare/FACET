import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

/**
 * @piece
 * 질문: 파스칼 삼각형의 한 줄은 바로 위 줄에서 어떻게 만들어지는가.
 *
 * 걸음마다 새 줄이 생기고, 그 줄의 안쪽 칸마다 바로 위 줄의 이웃한 두 수가 내려와 더해진다.
 * 양 끝은 위에 수가 하나뿐이라 1 이 그대로 내려온다.
 */
export const pascalTriangleFacet: FacetJson = {
  id: 'facet:pascalTriangle',
  title: {
    en: "Pascal's triangle — the two above add up",
    ko: '파스칼 삼각형 — 위 둘을 더해 아래가 된다',
    ja: 'パスカルの三角形 — 上の二つを足して下になる',
    zh: '帕斯卡三角 — 上面两个相加得到下面',
    ar: 'مثلث باسكال — مجموع العددين في الأعلى يصبح العدد في الأسفل',
    es: 'Triángulo de Pascal — los dos de arriba se suman',
    fr: 'Triangle de Pascal — les deux du dessus s’additionnent',
    hi: 'पास्कल त्रिभुज — ऊपर के दो जुड़कर नीचे बनते हैं',
    id: 'Segitiga Pascal — dua di atas dijumlahkan',
    pt: 'Triângulo de Pascal — os dois de cima se somam',
  },
  description: {
    en: "How is each row of Pascal's triangle made from the row just above it?",
    ko: '파스칼 삼각형의 한 줄은 바로 위 줄에서 어떻게 만들어지는가?',
    ja: 'パスカルの三角形の一行は、すぐ上の行からどう作られるのか?',
    zh: '帕斯卡三角的每一行是如何由正上方那一行得到的?',
    ar: 'كيف يُبنى كل صف في مثلث باسكال من الصف الذي فوقه مباشرة؟',
    es: '¿Cómo se construye cada fila del triángulo de Pascal a partir de la fila justo encima?',
    fr: 'Comment chaque ligne du triangle de Pascal se construit-elle à partir de la ligne juste au-dessus ?',
    hi: 'पास्कल त्रिभुज की हर पंक्ति ठीक ऊपर वाली पंक्ति से कैसे बनती है?',
    id: 'Bagaimana setiap baris segitiga Pascal dibentuk dari baris tepat di atasnya?',
    pt: 'Como cada linha do triângulo de Pascal é formada a partir da linha logo acima?',
  },
  algorithm: 'module:pascalTriangle',
  scene: 'module:pascalTriangleScene',
  initialData: {
    type: 'pascal-triangle',
    lastRow: 6,
    stepMs: 1600,
  },
  shuffleOnReset: false,
  messages: {
    'label.row': {
      en: 'Row {n}',
      ko: '줄 {n}',
      ja: '行 {n}',
      zh: '第 {n} 行',
      ar: 'الصف {n}',
      es: 'Fila {n}',
      fr: 'Ligne {n}',
      hi: 'पंक्ति {n}',
      id: 'Baris {n}',
      pt: 'Linha {n}',
    },
    'caption.head': {
      en: 'Row {n} · Cells: {cells}',
      ko: '줄 {n} · 칸: {cells}',
      ja: '行 {n} · マス: {cells}',
      zh: '第 {n} 行 · 格数: {cells}',
      ar: 'الصف {n} · الخانات: {cells}',
      es: 'Fila {n} · Casillas: {cells}',
      fr: 'Ligne {n} · Cases : {cells}',
      hi: 'पंक्ति {n} · खाने: {cells}',
      id: 'Baris {n} · Sel: {cells}',
      pt: 'Linha {n} · Casas: {cells}',
    },
    'caption.ends': {
      en: 'Ends only: the single number above comes down',
      ko: '양 끝만: 위에 하나뿐인 수가 그대로 내려온다',
      ja: '両端だけ: 上に一つしかない数がそのまま降りてくる',
      zh: '只有两端: 上方唯一的数直接落下',
      ar: 'الطرفان فقط: العدد الوحيد في الأعلى ينزل كما هو',
      es: 'Solo los extremos: el único número de arriba baja tal cual',
      fr: 'Les bords seulement : le seul nombre du dessus descend tel quel',
      hi: 'केवल दोनों सिरे: ऊपर का अकेला अंक वैसे ही नीचे आता है',
      id: 'Hanya kedua ujung: satu-satunya angka di atas turun apa adanya',
      pt: 'Só as pontas: o único número de cima desce como está',
    },
    'caption.sums': {
      en: 'Inner sums: {inner} · Largest: {a} + {b} = {sum}',
      ko: '안쪽 덧셈: {inner} · 가장 큰 수: {a} + {b} = {sum}',
      ja: '内側の足し算: {inner} · 最大: {a} + {b} = {sum}',
      zh: '内部加法: {inner} · 最大: {a} + {b} = {sum}',
      ar: 'عمليات الجمع الداخلية: {inner} · الأكبر: {a} + {b} = {sum}',
      es: 'Sumas interiores: {inner} · Mayor: {a} + {b} = {sum}',
      fr: 'Sommes intérieures : {inner} · Plus grand : {a} + {b} = {sum}',
      hi: 'भीतरी जोड़: {inner} · सबसे बड़ा: {a} + {b} = {sum}',
      id: 'Penjumlahan dalam: {inner} · Terbesar: {a} + {b} = {sum}',
      pt: 'Somas internas: {inner} · Maior: {a} + {b} = {sum}',
    },
  },
  blocks: {
    stage: { type: 'pascal-triangle-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
};
