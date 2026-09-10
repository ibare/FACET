/**
 * twoColorConflict — 홀수 길이의 고리에서 두 색 칠하기가 부딪힌다.
 *
 * @piece 조각. 질문 하나에 답하고 멈춘다 (S-piece).
 *   질문 — 이웃끼리 다른 색을 칠해 나가면, 왜 홀수 고리에서는 끝내 부딪히는가?
 *
 * 화면에 뜨는 값(고리의 길이 · 홀짝 · 마지막 변의 두 끝)은 하나도 여기 적지
 * 않는다. 아래 initialData 의 구조에서 algorithm 이 셈해 낸다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const twoColorConflictFacet: FacetJson = {
  id: 'facet:twoColorConflict',
  title: {
    en: 'Two colors collide on an odd ring',
    ko: '홀수 고리에서 부딪히는 두 색',
    ja: '奇数の輪で二色がぶつかる',
    zh: '两种颜色在奇数环上撞车',
    ar: 'لونان يتصادمان على حلقة فردية',
    es: 'Dos colores chocan en un anillo impar',
    fr: 'Deux couleurs se heurtent sur un anneau impair',
    hi: 'विषम चक्र पर दो रंग टकराते हैं',
    id: 'Dua warna bentrok di cincin ganjil',
    pt: 'Duas cores colidem num anel ímpar',
  },
  description: {
    en: 'Alternate two colors around a five-vertex ring and watch the last edge fail.',
    ko: '정점 다섯의 고리를 돌며 두 색을 번갈아 칠하고, 마지막 변에서 부딪히는 것을 본다.',
    ja: '頂点五つの輪を回りながら二色を交互に塗り、最後の辺で破れるのを見る。',
    zh: '绕着五个顶点的环交替涂两种颜色，看最后一条边如何失败。',
    ar: 'لوّن بالتناوب بلونين حول حلقة من خمسة رؤوس وشاهد الحافة الأخيرة تفشل.',
    es: 'Alterna dos colores en un anillo de cinco vértices y observa fallar la última arista.',
    fr: "Alterne deux couleurs autour d'un anneau de cinq sommets et regarde la dernière arête échouer.",
    hi: 'पाँच शीर्षों के चक्र पर दो रंग बारी-बारी भरो और देखो आखिरी किनारा कैसे टूटता है।',
    id: 'Warnai bergantian dua warna mengelilingi cincin lima simpul, lalu lihat sisi terakhir gagal.',
    pt: 'Alterne duas cores num anel de cinco vértices e veja a última aresta falhar.',
  },
  algorithm: 'module:twoColorConflict',
  projector: 'module:twoColorConflictProjector',
  initialData: {
    type: 'two-color-ring',
    nodes: ['P', 'Q', 'R', 'S', 'T'],
    edges: [
      { a: 'P', b: 'Q' },
      { a: 'Q', b: 'R' },
      { a: 'R', b: 'S' },
      { a: 'S', b: 'T' },
      { a: 'T', b: 'P' },
    ],
    start: 'P',
    // 걸음 간격. 걸음 하나는 stage 의 이동 애니메이션 + 이 간격이다 (S-piece).
    stepMs: 850,
  },
  blocks: {
    stage: { type: 'two-color-conflict-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.start': {
      // 규칙("이웃끼리 같은 색일 수 없다")은 글이 첫 문단에서 말한다. 화면이
      // 되풀이하면 상시 캡션이 되고, 그것은 조각이 할 일이 아니다 (S-piece).
      en: 'A ring of vertices, none of them painted yet.',
      ko: '정점들이 고리를 이룬다. 아직 아무것도 칠하지 않았다.',
      ja: '頂点が輪をなす。まだ何も塗られていない。',
      zh: '顶点连成一个环，还没有涂色。',
      ar: 'حلقة من الرؤوس، لم يُلوَّن أيٌّ منها بعد.',
      es: 'Un anillo de vértices, ninguno pintado todavía.',
      fr: 'Un anneau de sommets, aucun encore peint.',
      hi: 'शीर्षों का एक चक्र, अभी कोई रंगा नहीं गया।',
      id: 'Cincin simpul, belum satu pun diwarnai.',
      pt: 'Um anel de vértices, nenhum pintado ainda.',
    },
    'caption.first': {
      en: 'Start at {node} with the first color.',
      ko: '{node} 에서 첫 색으로 시작한다.',
      ja: '{node} から最初の色で始める。',
      zh: '从 {node} 用第一种颜色开始。',
      ar: 'ابدأ من {node} باللون الأول.',
      es: 'Empieza en {node} con el primer color.',
      fr: 'On commence à {node} avec la première couleur.',
      hi: '{node} से पहले रंग के साथ शुरू।',
      id: 'Mulai dari {node} dengan warna pertama.',
      pt: 'Comece em {node} com a primeira cor.',
    },
    'caption.alternate': {
      en: '{prev} to {node} — neighbors differ, so the color flips.',
      ko: '{prev} 에서 {node} 로 — 이웃이 달라야 하니 색이 뒤집힌다.',
      ja: '{prev} から {node} へ — 隣り合う色は違わねばならないので、色が反転する。',
      zh: '从 {prev} 到 {node} — 相邻必须不同，所以颜色翻转。',
      ar: 'من {prev} إلى {node} — الجاران يختلفان، فينقلب اللون.',
      es: 'De {prev} a {node}: los vecinos deben diferir, así que el color se invierte.',
      fr: 'De {prev} à {node} — les voisins doivent différer, donc la couleur bascule.',
      hi: '{prev} से {node} — पड़ोसी अलग होने चाहिए, इसलिए रंग पलट जाता है।',
      id: 'Dari {prev} ke {node} — tetangga harus berbeda, jadi warnanya berbalik.',
      pt: 'De {prev} para {node} — os vizinhos devem diferir, então a cor inverte.',
    },
    'caption.lastEdge': {
      en: 'One edge is left: {a}-{b}.',
      ko: '변이 하나 남았다 — {a}-{b}.',
      ja: '辺が一つ残った — {a}-{b}。',
      zh: '还剩一条边 — {a}-{b}。',
      ar: 'بقيت حافة واحدة: {a}-{b}.',
      es: 'Queda una arista: {a}-{b}.',
      fr: 'Il reste une arête : {a}-{b}.',
      hi: 'एक किनारा बचा है — {a}-{b}.',
      id: 'Tersisa satu sisi: {a}-{b}.',
      pt: 'Resta uma aresta: {a}-{b}.',
    },
    'caption.collide': {
      en: '{a} and {b} meet in the same color. This edge cannot hold.',
      ko: '{a} 와 {b} 가 같은 색으로 맞선다. 이 변은 지킬 수 없다.',
      ja: '{a} と {b} が同じ色で向き合う。この辺は守れない。',
      zh: '{a} 与 {b} 以同色相对。这条边守不住。',
      ar: '{a} و{b} يلتقيان باللون نفسه. هذه الحافة لا تصمد.',
      es: '{a} y {b} se encuentran con el mismo color. Esta arista no aguanta.',
      fr: '{a} et {b} se retrouvent de la même couleur. Cette arête ne tient pas.',
      hi: '{a} और {b} एक ही रंग में आमने-सामने हैं। यह किनारा टिक नहीं सकता।',
      id: '{a} dan {b} bertemu dengan warna yang sama. Sisi ini tak bisa bertahan.',
      pt: '{a} e {b} se encontram na mesma cor. Esta aresta não se sustenta.',
    },
    'caption.odd': {
      en: 'A ring of {n} is odd, so the alternation never closes.',
      ko: '길이 {n} 의 고리는 홀수라, 번갈아 칠하기가 끝내 닫히지 않는다.',
      ja: '長さ {n} の輪は奇数なので、交互塗りは決して閉じない。',
      zh: '长度为 {n} 的环是奇数，交替涂色始终合不拢。',
      ar: 'حلقة من {n} فردية، فالتناوب لا ينغلق أبدًا.',
      es: 'Un anillo de {n} es impar, así que la alternancia nunca cierra.',
      fr: "Un anneau de {n} est impair, donc l'alternance ne se referme jamais.",
      hi: '{n} लंबाई का चक्र विषम है, इसलिए बारी-बारी रंगना कभी बंद नहीं होता।',
      id: 'Cincin sepanjang {n} itu ganjil, jadi pergantian warna tak pernah menutup.',
      pt: 'Um anel de {n} é ímpar, então a alternância nunca fecha.',
    },
    'caption.even': {
      en: 'A ring of {n} is even, so the two colors close the ring.',
      ko: '길이 {n} 의 고리는 짝수라, 두 색으로 고리가 닫힌다.',
      ja: '長さ {n} の輪は偶数なので、二色で輪が閉じる。',
      zh: '长度为 {n} 的环是偶数，两种颜色就能合拢。',
      ar: 'حلقة من {n} زوجية، فيغلق اللونان الحلقة.',
      es: 'Un anillo de {n} es par, así que los dos colores lo cierran.',
      fr: 'Un anneau de {n} est pair, donc les deux couleurs referment la boucle.',
      hi: '{n} लंबाई का चक्र सम है, इसलिए दो रंगों से चक्र बंद हो जाता है।',
      id: 'Cincin sepanjang {n} itu genap, jadi dua warna menutup cincin.',
      pt: 'Um anel de {n} é par, então as duas cores fecham o anel.',
    },
  },
};
