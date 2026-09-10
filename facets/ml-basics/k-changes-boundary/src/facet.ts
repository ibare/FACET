/**
 * k 값의 영향 — "몇을 물어보느냐가 답을 바꾸는가" 에 답하는 조각.
 *
 * @piece 물음점을 둘러싼 테두리가 자라며 안에 드는 이웃이 늘고, 어느 순간
 * 다수가 바뀌어 답이 뒤집힌다. 같은 점, 같은 데이터, 같은 방법인데 답이 둘이다.
 *
 * initialData 에는 **구조만** 둔다 — 물음점 · 이름표 있는 점 열 · 보일 k 값.
 * 거리 · 표 · 테두리 반지름은 algorithm 이 셈하고, 화면 좌표는 stage 가 캔버스
 * 에서 역산한다 (S-piece). `stepMs` 만 예외로 여기 둔다 — 읽을 시간을 주는 것은
 * 그림의 결과가 아니라 저작 결정이다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const kChangesBoundaryFacet: FacetJson = {
  id: 'facet:kChangesBoundary',
  title: {
    en: 'How k changes the answer',
    ko: 'k 가 답을 바꾼다',
    ja: 'k が答えを変える',
    zh: 'k 如何改变答案',
    ar: 'كيف يغيّر k الجواب',
    es: 'Cómo k cambia la respuesta',
    fr: 'Comment k change la réponse',
    hi: 'k कैसे उत्तर बदलता है',
    id: 'Bagaimana k mengubah jawabannya',
    pt: 'Como o k muda a resposta',
  },
  description: {
    en: 'The nearest neighbour says one thing, the nearest three say another.',
    ko: '가장 가까운 하나와 가장 가까운 셋이 서로 다른 답을 낸다.',
    ja: '最も近い一つと最も近い三つが違う答えを出す。',
    zh: '最近的一个说这样，最近的三个说那样。',
    ar: 'الجار الأقرب يقول شيئاً، والثلاثة الأقرب يقولون غيره.',
    es: 'El vecino más cercano dice una cosa; los tres más cercanos, otra.',
    fr: 'Le plus proche voisin dit une chose, les trois plus proches en disent une autre.',
    hi: 'सबसे नज़दीकी पड़ोसी कुछ कहता है, सबसे नज़दीकी तीन कुछ और।',
    id: 'Tetangga terdekat berkata satu hal, tiga terdekat berkata lain.',
    pt: 'O vizinho mais próximo diz uma coisa; os três mais próximos, outra.',
  },
  algorithm: 'module:kChangesBoundary',
  projector: 'module:kChangesBoundaryProjector',
  initialData: {
    type: 'k-changes-boundary',
    query: { x: 4, y: 4 },
    points: [
      { x: 3.05, y: 5.0, label: 'A' },
      { x: 2.0, y: 3.0, label: 'A' },
      { x: 3.5, y: 6.55, label: 'A' },
      { x: 2.5, y: 1.5, label: 'A' },
      { x: 1.0, y: 4.0, label: 'A' },
      { x: 5.55, y: 4.5, label: 'B' },
      { x: 4.55, y: 2.0, label: 'B' },
      { x: 5.0, y: 6.1, label: 'B' },
      { x: 6.0, y: 2.5, label: 'B' },
      { x: 7.05, y: 4.0, label: 'B' },
    ],
    ks: [1, 3, 5, 7],
    stepMs: 900,
  },
  blocks: {
    stage: { type: 'k-changes-boundary-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.start': {
      en: 'The point in the middle has no label. Its neighbours will vote.',
      ko: '가운데 점에는 이름표가 없다. 이웃이 표를 던져 정한다.',
      ja: '真ん中の点には名札がない。近くの点が票を投じて決める。',
      zh: '中间的点没有标签，由邻居投票决定。',
      ar: 'النقطة في الوسط بلا تسمية، وجيرانها هم من يصوّتون.',
      es: 'El punto del centro no tiene etiqueta: votarán sus vecinos.',
      fr: 'Le point du milieu est sans étiquette : ses voisins vont voter.',
      hi: 'बीच वाले बिंदु का कोई लेबल नहीं। उसके पड़ोसी वोट देंगे।',
      id: 'Titik di tengah tak berlabel. Tetangganyalah yang memilih.',
      pt: 'O ponto do meio não tem rótulo: seus vizinhos vão votar.',
    },
    'caption.grow': {
      en: 'The boundary grows until it holds the nearest {k}.',
      ko: '테두리가 자라 가장 가까운 이웃을 담는다: {k}.',
      ja: '境界が広がり、最も近い {k} 個を包む。',
      zh: '边界扩大，直到包住最近的 {k} 个。',
      ar: 'يتّسع الحدّ حتى يضمّ أقرب {k}.',
      es: 'El límite crece hasta abarcar los {k} más cercanos.',
      fr: "La frontière s'élargit jusqu'à contenir les {k} plus proches.",
      hi: 'सीमा तब तक बढ़ती है जब तक सबसे नज़दीकी {k} उसमें न आ जाएँ।',
      id: 'Batasnya melebar sampai memuat {k} terdekat.',
      pt: 'A fronteira cresce até conter os {k} mais próximos.',
    },
    'caption.first': {
      en: 'Votes {la} {ca} : {lb} {cb} — the answer reads {verdict}.',
      ko: '표는 {la} {ca} 대 {lb} {cb}. 답은 {verdict}.',
      ja: '票は {la} {ca} 対 {lb} {cb} — 答えは {verdict}。',
      zh: '票数 {la} {ca} 比 {lb} {cb} — 答案是 {verdict}。',
      ar: 'الأصوات {la} {ca} مقابل {lb} {cb} — الجواب {verdict}.',
      es: 'Votos {la} {ca} : {lb} {cb} — la respuesta es {verdict}.',
      fr: 'Votes {la} {ca} contre {lb} {cb} — la réponse est {verdict}.',
      hi: 'वोट {la} {ca} : {lb} {cb} — उत्तर है {verdict}।',
      id: 'Suara {la} {ca} : {lb} {cb} — jawabannya {verdict}.',
      pt: 'Votos {la} {ca} : {lb} {cb} — a resposta é {verdict}.',
    },
    'caption.hold': {
      en: 'Votes {la} {ca} : {lb} {cb} — the answer stays {verdict}.',
      ko: '표는 {la} {ca} 대 {lb} {cb}. 답은 그대로 {verdict}.',
      ja: '票は {la} {ca} 対 {lb} {cb} — 答えは {verdict} のままだ。',
      zh: '票数 {la} {ca} 比 {lb} {cb} — 答案仍是 {verdict}。',
      ar: 'الأصوات {la} {ca} مقابل {lb} {cb} — يبقى الجواب {verdict}.',
      es: 'Votos {la} {ca} : {lb} {cb} — la respuesta sigue siendo {verdict}.',
      fr: 'Votes {la} {ca} contre {lb} {cb} — la réponse reste {verdict}.',
      hi: 'वोट {la} {ca} : {lb} {cb} — उत्तर वही {verdict} रहता है।',
      id: 'Suara {la} {ca} : {lb} {cb} — jawabannya tetap {verdict}.',
      pt: 'Votos {la} {ca} : {lb} {cb} — a resposta continua {verdict}.',
    },
    'caption.flip': {
      en: 'Votes {la} {ca} : {lb} {cb} — the answer flips to {verdict}.',
      ko: '표는 {la} {ca} 대 {lb} {cb}. 답이 뒤집혔다 → {verdict}.',
      ja: '票は {la} {ca} 対 {lb} {cb} — 答えが {verdict} にひっくり返る。',
      zh: '票数 {la} {ca} 比 {lb} {cb} — 答案翻转为 {verdict}。',
      ar: 'الأصوات {la} {ca} مقابل {lb} {cb} — ينقلب الجواب إلى {verdict}.',
      es: 'Votos {la} {ca} : {lb} {cb} — la respuesta se da la vuelta a {verdict}.',
      fr: 'Votes {la} {ca} contre {lb} {cb} — la réponse bascule vers {verdict}.',
      hi: 'वोट {la} {ca} : {lb} {cb} — उत्तर पलटकर {verdict} हो जाता है।',
      id: 'Suara {la} {ca} : {lb} {cb} — jawabannya berbalik jadi {verdict}.',
      pt: 'Votos {la} {ca} : {lb} {cb} — a resposta vira {verdict}.',
    },
    'caption.done': {
      en: 'The nearest one is {nearest}. Ask a few more and the answer becomes {verdict}.',
      ko: '가장 가까운 하나는 {nearest}. 그런데 몇을 더 물으면 답은 {verdict}.',
      ja: '最も近い一つは {nearest}。もう少し多く尋ねれば答えは {verdict} になる。',
      zh: '最近的一个是 {nearest}。多问几个，答案就成了 {verdict}。',
      ar: 'الأقرب هو {nearest}. وإن سألتَ بضعة أكثر صار الجواب {verdict}.',
      es: 'El más cercano es {nearest}. Pregunta a unos cuantos más y la respuesta pasa a ser {verdict}.',
      fr: 'Le plus proche est {nearest}. Interrogez-en quelques-uns de plus et la réponse devient {verdict}.',
      hi: 'सबसे नज़दीकी है {nearest}। कुछ और से पूछें तो उत्तर {verdict} हो जाता है।',
      id: 'Yang terdekat adalah {nearest}. Tanya beberapa lagi, jawabannya jadi {verdict}.',
      pt: 'O mais próximo é {nearest}. Pergunte a mais alguns e a resposta passa a {verdict}.',
    },
  },
};
