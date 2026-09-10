/**
 * indegree-zero-first — 조각(piece) facet 선언.
 *
 * @piece 들어오는 화살이 하나도 없는 것만 지금 꺼낼 수 있고, 꺼내고 나면
 *        다음 것이 0 이 된다.
 *
 * 진입 차수는 선언에 적지 않는다 — `edges` 에서 algorithm 이 센다. 손으로 적은
 * 표를 두면 그림이 구조와 어긋날 수 있고, 그때 화면이 거짓을 말하게 된다.
 *
 * header 도 metrics 도 layout 도 두지 않는다 (S-piece).
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const indegreeZeroFirstFacet: FacetJson = {
  id: 'facet:indegreeZeroFirst',
  title: {
    en: 'Take the ones with nothing coming in',
    ko: '들어오는 것이 없는 것부터 꺼낸다',
    ja: '入ってくるものがないものから取る',
    zh: '先取没有入边的',
    ar: 'خذ ما لا يدخله شيء',
    es: 'Toma los que no reciben nada',
    fr: 'Prendre ceux qui ne reçoivent rien',
    hi: 'जिनमें कुछ नहीं आता, उन्हें पहले लें',
    id: 'Ambil yang tidak menerima apa pun',
    pt: 'Pegue os que não recebem nada',
  },
  description: {
    en: 'Only a vertex with no incoming arrows can be taken. Taking it drops the arrows it held, and whoever reaches 0 falls next.',
    ko: '들어오는 화살이 없는 정점만 꺼낼 수 있다. 꺼내면 그것이 걸어 두었던 화살이 떨어지고, 0 이 된 것이 뒤따라 떨어진다.',
    ja: '入ってくる矢のない頂点だけを取れる。取ればその頂点が掛けていた矢が落ち、0 になったものが次に落ちる。',
    zh: '只有没有入箭的顶点才能取走。取走后它挂着的箭随之落下，谁归零谁就接着落。',
    ar: 'لا يمكن أخذ إلا رأس لا تدخله أي أسهم. أخذه يُسقط الأسهم التي كان يحملها، ومن يبلغ 0 يسقط بعده.',
    es: 'Solo se puede tomar un vértice sin flechas entrantes. Al tomarlo caen las flechas que sostenía, y el que llega a 0 cae después.',
    fr: "On ne peut prendre qu'un sommet sans flèche entrante. Le prendre fait tomber les flèches qu'il tenait, et celui qui atteint 0 tombe ensuite.",
    hi: 'सिर्फ़ वही शीर्ष लिया जा सकता है जिसमें कोई तीर नहीं आता। उसे लेते ही उसके थामे तीर गिर जाते हैं, और जो 0 पर पहुँचे वह अगला गिरता है।',
    id: 'Hanya simpul tanpa panah masuk yang bisa diambil. Mengambilnya menjatuhkan panah yang ia pegang, dan yang mencapai 0 jatuh berikutnya.',
    pt: 'Só um vértice sem setas de entrada pode ser tirado. Tirá-lo derruba as setas que ele segurava, e quem chega a 0 cai em seguida.',
  },
  algorithm: 'module:indegreeZeroFirst',
  projector: 'module:indegreeZeroFirstProjector',
  initialData: {
    type: 'indegree-zero-first',
    nodes: ['a', 'b', 'c', 'd', 'e'],
    edges: [
      { from: 'a', to: 'c' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'd' },
      { from: 'c', to: 'e' },
      { from: 'b', to: 'e' },
    ],
    stepMs: 900,
  },
  blocks: {
    stage: { type: 'indegree-zero-first-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.count': {
      en: 'Count the arrows coming into each vertex.',
      ko: '각 정점으로 들어오는 화살을 센다.',
      ja: '各頂点に入ってくる矢を数える。',
      zh: '数一数每个顶点有几支箭射入。',
      ar: 'عُدّ الأسهم الداخلة إلى كل رأس.',
      es: 'Se cuentan las flechas que entran en cada vértice.',
      fr: 'On compte les flèches qui entrent dans chaque sommet.',
      hi: 'हर शीर्ष में आने वाले तीर गिनें।',
      id: 'Hitung panah yang masuk ke setiap simpul.',
      pt: 'Contam-se as setas que entram em cada vértice.',
    },
    'caption.startReady': {
      en: '{ids} carry nothing — only these can be taken now.',
      ko: '{ids} 는 이고 있는 것이 없다 — 지금 꺼낼 수 있는 것은 이것뿐이다.',
      ja: '{ids} は何も背負っていない — いま取れるのはこれだけだ。',
      zh: '{ids} 什么都没担着 — 现在能取的只有它们。',
      ar: '{ids} لا تحمل شيئًا — هذه وحدها يمكن أخذها الآن.',
      es: '{ids} no cargan nada: solo estos se pueden tomar ahora.',
      fr: '{ids} ne portent rien — seuls ceux-là peuvent être pris maintenant.',
      hi: '{ids} पर कुछ नहीं टिका — अभी बस इन्हें ही लिया जा सकता है।',
      id: '{ids} tidak memikul apa pun — hanya ini yang bisa diambil sekarang.',
      pt: '{ids} não carregam nada — só estes podem ser tirados agora.',
    },
    'caption.take': {
      en: 'Take {id} — it carries 0.',
      ko: '{id} 를 꺼낸다 — 이고 있는 수가 0 이다.',
      ja: '{id} を取る — 背負っている数は 0 だ。',
      zh: '取走 {id} — 它担着的数是 0。',
      ar: 'خذ {id} — ما يحمله 0.',
      es: 'Se toma {id}: carga 0.',
      fr: 'On prend {id} — il en porte 0.',
      hi: '{id} को लें — इस पर 0 है।',
      id: 'Ambil {id} — yang dipikulnya 0.',
      pt: 'Tira-se {id} — carrega 0.',
    },
    'caption.drop': {
      en: '{id} is gone, so the arrows it held fall off: {drops}',
      ko: '{id} 가 빠지자 걸려 있던 화살이 떨어진다: {drops}',
      ja: '{id} が抜けて、掛かっていた矢が落ちる: {drops}',
      zh: '{id} 走了，它挂着的箭随之落下：{drops}',
      ar: 'ذهب {id}، فسقطت الأسهم التي كان يحملها: {drops}',
      es: '{id} se fue, así que caen las flechas que sostenía: {drops}',
      fr: "{id} est parti, les flèches qu'il tenait tombent : {drops}",
      hi: '{id} हट गया, तो उसके थामे तीर गिर पड़े: {drops}',
      id: '{id} pergi, panah yang ia pegang pun jatuh: {drops}',
      pt: '{id} saiu, então caem as setas que ele segurava: {drops}',
    },
    'caption.newReady': {
      en: '{ids} just reached 0 — they fall next.',
      ko: '{ids} 가 방금 0 이 되었다 — 뒤따라 떨어진다.',
      ja: '{ids} がちょうど 0 になった — 次に落ちる。',
      zh: '{ids} 刚好归零 — 接着就轮到它们。',
      ar: 'بلغ {ids} الصفر للتو — يسقط بعدها.',
      es: '{ids} acaban de llegar a 0: caen a continuación.',
      fr: '{ids} viennent de tomber à 0 — ils suivent.',
      hi: '{ids} अभी 0 पर पहुँचे — अगली बारी इनकी।',
      id: '{ids} baru saja mencapai 0 — merekalah yang jatuh berikutnya.',
      pt: '{ids} acabaram de chegar a 0 — caem a seguir.',
    },
    'caption.done': {
      en: 'Order: {order}',
      ko: '순서: {order}',
      ja: '順序: {order}',
      zh: '顺序：{order}',
      ar: 'الترتيب: {order}',
      es: 'Orden: {order}',
      fr: 'Ordre : {order}',
      hi: 'क्रम: {order}',
      id: 'Urutan: {order}',
      pt: 'Ordem: {order}',
    },
  },
};
