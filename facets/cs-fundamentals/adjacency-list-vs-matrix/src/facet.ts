/**
 * @piece 인접 리스트와 인접 행렬 — 이웃을 목록으로 두는가, 표로 두는가.
 *
 * 이 facet 이 답하는 질문:
 *   "같은 그래프를 두 그릇에 담으면, 물음마다 어느 쪽이 싼가?"
 *
 * 다섯 간선을 인접 리스트(목록)와 인접 행렬(표)에 동시에 채우고, 두 물음을
 * 실제로 세어 비용을 비교한다 — "A 와 E 는 이웃인가" 는 행렬이 싸고(1번),
 * "A 의 이웃을 모두 대라" 는 리스트가 싸다(2번 vs 5번). 어느 하나가 나은 게
 * 아니라 무엇을 자주 묻느냐가 고른다.
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 + 한 걸음) / 제목 없음 / 메트릭 없음 /
 * 캔버스 폭 620.
 *
 * 데이터는 호스트가 확정한 실측값이다 — 정점 A~E, 간선 A-B·A-C·B-D·C-D·D-E.
 * 걸음이 실제로 세는 값(목록 길이 2·2·2·3·1, 물음 비용 2/1 과 2/5)은 전부
 * algorithm 이 이 데이터를 순회해 낸다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL } from '@ffacet/core/runtime';

export const adjacencyListVsMatrixFacet: FacetJson = {
  id: 'facet:adjacencyListVsMatrix',
  title: {
    en: 'Adjacency List vs. Matrix',
    ko: '인접 리스트와 인접 행렬',
    ja: '隣接リストと隣接行列',
    zh: '邻接表与邻接矩阵',
    ar: 'قائمة الجوار مقابل مصفوفة الجوار',
    es: 'Lista frente a matriz de adyacencia',
    fr: "Liste d'adjacence ou matrice",
    hi: 'एडजेसेंसी लिस्ट बनाम मैट्रिक्स',
    id: 'Daftar ketetanggaan vs. matriks',
    pt: 'Lista vs. matriz de adjacência',
  },
  description: {
    en: 'The same edges land in a list that grows and a table that was already there',
    ko: '같은 간선이 자라는 목록과, 이미 잡혀 있던 표에 함께 떨어진다',
    ja: '同じ辺が、伸びていくリストと、はじめから用意された表の両方に落ちる',
    zh: '同样的边，落进不断变长的表，也落进早已备好的方格',
    ar: 'الحواف نفسها تقع في قائمة تنمو وفي جدول كان محجوزًا من قبل',
    es: 'Las mismas aristas caen en una lista que crece y en una tabla que ya estaba reservada',
    fr: 'Les mêmes arêtes tombent dans une liste qui grandit et dans un tableau déjà réservé',
    hi: 'वही किनारे एक बढ़ती सूची में और पहले से बनी तालिका में, दोनों में गिरते हैं',
    id: 'Sisi yang sama jatuh ke daftar yang tumbuh dan ke tabel yang sudah disiapkan',
    pt: 'As mesmas arestas caem numa lista que cresce e numa tabela já reservada',
  },
  algorithm: 'module:adjacencyListVsMatrix',
  projector: 'module:adjacencyListVsMatrixProjector',
  initialData: {
    type: 'adjacency-list-vs-matrix',
    vertices: ['A', 'B', 'C', 'D', 'E'],
    edges: [
      ['A', 'B'],
      ['A', 'C'],
      ['B', 'D'],
      ['C', 'D'],
      ['D', 'E'],
    ],
    stepMs: 700,
  },
  shuffleOnReset: false,
  messages: {
    // 비용 배지 — 수는 굳히지 않고 자리만 둔다 (C10).
    'badge.list': {
      en: 'list {n}',
      ko: '목록 {n}',
      ja: 'リスト {n}',
      zh: '列表 {n}',
      ar: 'قائمة {n}',
      es: 'lista {n}',
      fr: 'liste {n}',
      hi: 'सूची {n}',
      id: 'daftar {n}',
      pt: 'lista {n}',
    },
    'badge.matrix': {
      en: 'matrix {n}',
      ko: '표 {n}',
      ja: '行列 {n}',
      zh: '矩阵 {n}',
      ar: 'مصفوفة {n}',
      es: 'matriz {n}',
      fr: 'matrice {n}',
      hi: 'मैट्रिक्स {n}',
      id: 'matriks {n}',
      pt: 'matriz {n}',
    },
    'caption.init': {
      en: 'The list starts with no cells; the matrix already holds {cells} reserved cells.',
      ko: '목록은 아직 칸이 없고, 표는 {cells}칸을 이미 잡아 두었다.',
      ja: 'リストはまだ枠がなく、行列はすでに {cells} 個の枠を押さえている。',
      zh: '列表还没有格子，矩阵已经占好了 {cells} 个格子。',
      ar: 'تبدأ القائمة بلا خانات، والمصفوفة تحجز {cells} خانة سلفًا.',
      es: 'La lista empieza sin celdas; la matriz ya reserva {cells} celdas.',
      fr: 'La liste part sans cases ; la matrice en réserve déjà {cells}.',
      hi: 'सूची में अभी कोई खाना नहीं; मैट्रिक्स पहले ही {cells} खाने घेर चुकी है।',
      id: 'Daftar mulai tanpa sel; matriks sudah memesan {cells} sel.',
      pt: 'A lista começa sem células; a matriz já reserva {cells} células.',
    },
    'caption.q1': {
      en: 'Are {a} and {b} neighbors?',
      ko: '{a} 와 {b} 는 이웃인가?',
      ja: '{a} と {b} は隣り合っているか。',
      zh: '{a} 和 {b} 是邻居吗？',
      ar: 'هل {a} و {b} جاران؟',
      es: '¿Son {a} y {b} vecinos?',
      fr: '{a} et {b} sont-ils voisins ?',
      hi: 'क्या {a} और {b} पड़ोसी हैं?',
      id: 'Apakah {a} dan {b} bertetangga?',
      pt: '{a} e {b} são vizinhos?',
    },
    'caption.q2': {
      en: 'List all of {a}’s neighbors.',
      ko: '{a} 의 이웃을 모두 대라.',
      ja: '{a} の隣をすべて挙げよ。',
      zh: '列出 {a} 的所有邻居。',
      ar: 'اذكر كل جيران {a}.',
      es: 'Enumera todos los vecinos de {a}.',
      fr: 'Cite tous les voisins de {a}.',
      hi: '{a} के सभी पड़ोसी बताओ।',
      id: 'Sebutkan semua tetangga {a}.',
      pt: 'Enumera todos os vizinhos de {a}.',
    },
    'caption.result': {
      en: 'List touched {list} cell(s) · Matrix touched {matrix} cell(s).',
      ko: '목록은 {list}번 · 행렬은 {matrix}번 짚었다.',
      ja: 'リストは {list} 回、行列は {matrix} 回さわった。',
      zh: '列表摸了 {list} 次 · 矩阵摸了 {matrix} 次。',
      ar: 'لمست القائمة {list} خانة · ولمست المصفوفة {matrix} خانة.',
      es: 'La lista tocó {list} celda(s) · la matriz, {matrix}.',
      fr: 'La liste a touché {list} case(s) · la matrice, {matrix}.',
      hi: 'सूची ने {list} खाने छुए · मैट्रिक्स ने {matrix}।',
      id: 'Daftar menyentuh {list} sel · matriks {matrix} sel.',
      pt: 'A lista tocou {list} célula(s) · a matriz, {matrix}.',
    },
    'label.list': {
      en: 'Adjacency list',
      ko: '인접 리스트',
      ja: '隣接リスト',
      zh: '邻接表',
      ar: 'قائمة الجوار',
      es: 'Lista de adyacencia',
      fr: "Liste d'adjacence",
      hi: 'एडजेसेंसी लिस्ट',
      id: 'Daftar ketetanggaan',
      pt: 'Lista de adjacência',
    },
    'label.matrix': {
      en: 'Adjacency matrix',
      ko: '인접 행렬',
      ja: '隣接行列',
      zh: '邻接矩阵',
      ar: 'مصفوفة الجوار',
      es: 'Matriz de adyacencia',
      fr: "Matrice d'adjacence",
      hi: 'एडजेसेंसी मैट्रिक्स',
      id: 'Matriks ketetanggaan',
      pt: 'Matriz de adjacência',
    },
  },
  blocks: {
    stage: { type: 'adjacency-list-vs-matrix-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
};
