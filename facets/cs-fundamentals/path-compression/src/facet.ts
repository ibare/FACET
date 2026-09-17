/**
 * @piece
 *
 * 경로 압축 — 뿌리를 찾아 오른 김에, 지나온 자리 전부를 뿌리에 곧장 다시
 * 붙이면 그 길 위의 모든 자리가 함께 싸진다는 것을 보여준다.
 *
 * 화면은 장면(Scene) 방식이다. projector 를 두지 않고 `scene.ts` 가 이벤트를 상태로
 * 옮기며, stage 는 `render(next, prev, { animate })` 하나로 산다 (S-scene).
 *
 * 컨트롤은 `CONTROL_SET.pieceScrub` — 다시 보기와 스크럽 띠다. 어느 걸음의 화면이든
 * 셈으로 얻으므로 띠를 끌어 아무 데나 갈 수 있다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const pathCompressionFacet: FacetJson = {
  id: 'facet:pathCompression',
  title: {
    en: 'Path Compression',
    ko: '경로 압축',
    ja: '経路圧縮',
    zh: '路径压缩',
    ar: 'ضغط المسار',
    es: 'Compresión de caminos',
    fr: 'Compression de chemin',
    hi: 'पथ संपीड़न',
    id: 'Kompresi jalur',
    pt: 'Compressão de caminho',
  },
  description: {
    en: 'Climbing to the root pays off for every node on the way, not just the one you asked about.',
    ko: '뿌리까지 오르는 수고는 물어본 자리 하나가 아니라 그 길 위의 모든 자리를 함께 싸게 만든다.',
    ja: '根まで登った手間は、尋ねたノードだけでなく途中のすべてのノードに報いる。',
    zh: '爬到根的代价，回报的不只是你问的那个节点，而是路上的每一个节点。',
    ar: 'الصعود إلى الجذر يفيد كل عقدة على الطريق، لا العقدة التي سألت عنها وحدها.',
    es: 'Subir hasta la raíz beneficia a todos los nodos del camino, no solo al que preguntaste.',
    fr: "Monter jusqu'à la racine profite à tous les nœuds du chemin, pas seulement à celui qu'on a interrogé.",
    hi: 'जड़ तक चढ़ने की मेहनत रास्ते के हर नोड को सस्ता कर देती है, सिर्फ़ पूछे गए नोड को नहीं।',
    id: 'Memanjat ke akar menguntungkan setiap simpul di sepanjang jalan, bukan hanya yang ditanyakan.',
    pt: 'Subir até a raiz compensa para todos os nós do caminho, não só para o que você perguntou.',
  },
  algorithm: 'module:pathCompression',
  scene: 'module:pathCompressionScene',
  initialData: {
    type: 'path-compression',
    parent: [0, 0, 1, 2, 3],
    query: 4,
    stepMs: 680,
  },
  blocks: {
    stage: { type: 'path-compression-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
  messages: {
    'caption.queryBegin': {
      en: 'Ask where {node} leads, all the way to the root',
      ko: '{node} 에서 시작해 어디로 이어지는지 뿌리까지 묻는다',
      ja: '{node} がどこへつながるか、根まで尋ねる',
      zh: '一路问到根：{node} 通向哪里',
      ar: 'اسأل إلى أين يقود {node}، وصولًا إلى الجذر',
      es: 'Pregunta adónde lleva {node}, hasta la raíz',
      fr: "Demander où mène {node}, jusqu'à la racine",
      hi: 'पूछें कि {node} कहाँ ले जाता है, जड़ तक',
      id: 'Tanyakan ke mana {node} menuju, sampai ke akar',
      pt: 'Pergunte aonde {node} leva, até a raiz',
    },
    'caption.climb': {
      en: '{from} points up to {to}',
      ko: '{from} 의 화살표가 {to} 에 닿아 있다',
      ja: '{from} は {to} を指している',
      zh: '{from} 指向 {to}',
      ar: '{from} يشير إلى {to}',
      es: '{from} apunta a {to}',
      fr: '{from} pointe vers {to}',
      hi: '{from} {to} की ओर इशारा करता है',
      id: '{from} menunjuk ke {to}',
      pt: '{from} aponta para {to}',
    },
    'caption.rootFirst': {
      en: '{node} reached root {root} after {hops} hops',
      ko: '{node} 에서 {hops}칸 올라 뿌리 {root} 에 닿았다',
      ja: '{node} は {hops} 回たどって根 {root} に着いた',
      zh: '{node} 跳了 {hops} 次到达根 {root}',
      ar: 'وصل {node} إلى الجذر {root} بعد {hops} قفزات',
      es: '{node} llegó a la raíz {root} tras {hops} saltos',
      fr: '{node} a atteint la racine {root} en {hops} sauts',
      hi: '{node} {hops} छलांगों में जड़ {root} तक पहुँचा',
      id: '{node} sampai ke akar {root} setelah {hops} lompatan',
      pt: '{node} chegou à raiz {root} após {hops} saltos',
    },
    'caption.rootAfter': {
      en: '{node} now reaches {root} in {hops} hop — it used to take {hopsBefore}',
      ko: '{node} 에서 이제 {hops}칸 만에 {root} 에 닿는다 — 전에는 {hopsBefore}칸',
      ja: '{node} は今や {hops} 回で {root} に着く — 以前は {hopsBefore} 回だった',
      zh: '{node} 现在 {hops} 跳就到 {root} — 以前要 {hopsBefore} 跳',
      ar: 'يصل {node} الآن إلى {root} في {hops} قفزة — كانت تلزمه {hopsBefore}',
      es: '{node} ahora llega a {root} en {hops} salto — antes le costaba {hopsBefore}',
      fr: '{node} atteint maintenant {root} en {hops} saut — il en fallait {hopsBefore}',
      hi: '{node} अब {hops} छलांग में {root} तक पहुँचता है — पहले {hopsBefore} लगती थीं',
      id: '{node} kini mencapai {root} dalam {hops} lompatan — dulu perlu {hopsBefore}',
      pt: '{node} agora alcança {root} em {hops} salto — antes levava {hopsBefore}',
    },
    'caption.compress': {
      en: 'Compressing — every node on the path now points straight to {root}',
      ko: '접는다 — 지나온 자리 전부가 이제 곧장 가리키는 곳은 {root}',
      ja: '圧縮する — 経路上のすべてのノードが {root} を直接指す',
      zh: '压缩 — 路径上的每个节点现在都直接指向 {root}',
      ar: 'نضغط — كل عقدة على المسار تشير الآن مباشرة إلى {root}',
      es: 'Comprimiendo: todos los nodos del camino apuntan ahora directo a {root}',
      fr: 'Compression — tous les nœuds du chemin pointent désormais droit sur {root}',
      hi: 'संपीड़न — पथ का हर नोड अब सीधे {root} की ओर इशारा करता है',
      id: 'Memampatkan — setiap simpul di jalur kini menunjuk langsung ke {root}',
      pt: 'Comprimindo — todos os nós do caminho agora apontam direto para {root}',
    },
    'caption.summary': {
      en: '{before} hops become {after}',
      ko: '{before}칸이 {after}칸이 된다',
      ja: '{before} 回が {after} 回になる',
      zh: '{before} 跳变成 {after} 跳',
      ar: '{before} قفزات تصير {after}',
      es: '{before} saltos pasan a {after}',
      fr: '{before} sauts deviennent {after}',
      hi: '{before} छलांगें {after} रह जाती हैं',
      id: '{before} lompatan menjadi {after}',
      pt: '{before} saltos viram {after}',
    },
    'caption.rewind': {
      en: 'Replaying from the start',
      ko: '처음부터 다시 보여준다',
      ja: '最初からもう一度',
      zh: '从头再放一次',
      ar: 'إعادة من البداية',
      es: 'Repitiendo desde el principio',
      fr: 'Rejoué depuis le début',
      hi: 'शुरू से फिर दिखाते हैं',
      id: 'Diputar ulang dari awal',
      pt: 'Repetindo desde o início',
    },
    'label.hopCount': {
      en: 'hop {n}',
      ko: '{n}칸',
      ja: '{n} 回目',
      zh: '第 {n} 跳',
      ar: 'قفزة {n}',
      es: 'salto {n}',
      fr: 'saut {n}',
      hi: 'छलांग {n}',
      id: 'lompatan {n}',
      pt: 'salto {n}',
    },
  },
};
