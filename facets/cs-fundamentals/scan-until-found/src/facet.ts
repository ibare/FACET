/**
 * scanUntilFound facet 선언.
 *
 * @piece 조각(piece) — "찾으면 멎지만, 없다고 답하려면 끝까지 봐야 한다" 하나에만
 * 답한다. 머리글도 메트릭도 두지 않고, 배치는 러너가 정한다 (S-piece).
 *
 * 데이터는 줄이 서 있지 않은 [5, 8, 2, 9, 4] 한 벌과 찾을 값 둘 뿐이다.
 * 화면에 뜨는 수 — 본 칸 수 4 와 5 — 는 여기 적지 않는다. 훑기가 실제로 세고
 * 그 값이 그대로 올라온다 (S-piece).
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const scanUntilFoundFacet: FacetJson = {
  id: 'facet:scanUntilFound',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: {
    en: 'Linear Search',
    ko: '순차 탐색',
    ja: '線形探索',
    zh: '线性查找',
    ar: 'البحث الخطي',
    es: 'Búsqueda lineal',
    fr: 'Recherche linéaire',
    hi: 'रैखिक खोज',
    id: 'Pencarian linear',
    pt: 'Busca linear',
  },
  description: {
    en: 'The same gaze crosses the same row twice — once it stops early, once it runs off the end.',
    ko: '같은 눈길이 같은 줄을 두 번 지나간다 — 한 번은 도중에 멎고, 한 번은 끝을 지나 빠져나간다.',
    ja: '同じ目が同じ列を二度たどる — 一度は途中で止まり、一度は端を越えて出ていく。',
    zh: '同一道目光两次扫过同一行 — 一次中途停下，一次冲出末端。',
    ar: 'النظرة نفسها تعبر الصف نفسه مرتين — مرة تتوقف مبكرًا، ومرة تتجاوز النهاية.',
    es: 'La misma mirada recorre la misma fila dos veces: una se detiene antes, otra se sale por el final.',
    fr: "Le même regard parcourt deux fois la même rangée — une fois il s'arrête tôt, une fois il dépasse la fin.",
    hi: 'वही नज़र उसी पंक्ति को दो बार पार करती है — एक बार बीच में रुकती है, एक बार सिरा पार कर जाती है।',
    id: 'Pandangan yang sama melintasi baris yang sama dua kali — sekali berhenti di tengah, sekali melewati ujungnya.',
    pt: 'O mesmo olhar percorre a mesma fila duas vezes — uma pára a meio, outra passa do fim.',
  },
  algorithm: 'module:scanUntilFound',
  projector: 'module:scanUntilFoundProjector',
  initialData: {
    type: 'scan-until-found',
    values: [5, 8, 2, 9, 4],
    queries: [9, 6],
    stepMs: 650,
  },
  blocks: {
    stage: { type: 'scan-until-found-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.looking': {
      en: 'Looking for {target}.',
      ko: '찾는 값 {target}.',
      ja: '{target} を探す。',
      zh: '要找 {target}。',
      ar: 'نبحث عن {target}.',
      es: 'Se busca {target}.',
      fr: 'On cherche {target}.',
      hi: '{target} खोज रहे हैं।',
      id: 'Mencari {target}.',
      pt: 'Procura-se {target}.',
    },
    'caption.found': {
      en: 'Found it. {seen} cells looked at, then it stopped.',
      ko: '찾았다. {seen} 칸을 보고 멎었다.',
      ja: '見つかった。{seen} 個見て止まった。',
      zh: '找到了。看了 {seen} 格就停了。',
      ar: 'وُجد. نُظر إلى {seen} خانة ثم توقّف.',
      es: 'Encontrado. Se miraron {seen} casillas y se detuvo.',
      fr: 'Trouvé. {seen} cases regardées, puis arrêt.',
      hi: 'मिल गया। {seen} खाने देखकर रुक गया।',
      id: 'Ketemu. {seen} sel dilihat, lalu berhenti.',
      pt: 'Encontrado. Olhou {seen} casas e parou.',
    },
    'caption.overrun': {
      en: 'Off the end. Saying "not here" took all {seen} — there was no place to give up.',
      ko: '끝을 지나쳤다. 없다고 답하려면 {seen} 칸을 다 봐야 했다.',
      ja: '端を越えた。「ない」と答えるには {seen} 個すべてを見なければならなかった。',
      zh: '冲出了末端。要说“不在这里”，得把 {seen} 格全看完 — 没有可以放弃的地方。',
      ar: 'تجاوز النهاية. قول «غير موجود» كلّف {seen} كلها — لم يكن ثمة موضع للاستسلام.',
      es: 'Se pasó del final. Decir «no está» costó las {seen}: no había dónde rendirse.',
      fr: "Dépassé la fin. Dire « il n'est pas là » a coûté les {seen} — nulle part où abandonner.",
      hi: 'सिरा पार हो गया। “यहाँ नहीं है” कहने के लिए पूरे {seen} खाने देखने पड़े — छोड़ने की कोई जगह नहीं थी।',
      id: 'Lewat ujungnya. Menjawab “tidak ada” menghabiskan {seen} semuanya — tak ada tempat untuk menyerah.',
      pt: 'Passou do fim. Dizer «não está» custou as {seen} — não havia onde desistir.',
    },
    'caption.gap': {
      en: 'Stopping cost {stopped}. Answering "no" cost {exhausted}.',
      ko: '멎을 때는 {stopped} 칸, 없다고 답할 때는 {exhausted} 칸.',
      ja: '止まるときは {stopped} 個、「ない」と答えるときは {exhausted} 個。',
      zh: '中途停下要 {stopped} 格。答“没有”要 {exhausted} 格。',
      ar: 'التوقّف كلّف {stopped}. وقول «لا» كلّف {exhausted}.',
      es: 'Detenerse costó {stopped}. Responder «no» costó {exhausted}.',
      fr: "S'arrêter a coûté {stopped}. Répondre « non » a coûté {exhausted}.",
      hi: 'रुकने में {stopped} लगे। “नहीं” कहने में {exhausted}।',
      id: 'Berhenti memakan {stopped}. Menjawab “tidak” memakan {exhausted}.',
      pt: 'Parar custou {stopped}. Responder «não» custou {exhausted}.',
    },
  },
};
