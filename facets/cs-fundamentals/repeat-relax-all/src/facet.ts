/**
 * @piece 모든 간선을 거듭 펴기 — 왜 바퀴가 여러 번 필요한가.
 *
 * 답하는 질문: 어느 간선을 먼저 볼지 모르는데, 왜 전부를 정점 수만큼 되풀이해야
 * 하는가. 간선을 보는 순서가 거꾸로 놓이면 한 바퀴에 정보가 딱 한 칸만 나아가고,
 * 나머지 살핌은 헛돈다. 그 헛수고가 보여야 "정점 수 빼기 하나" 가 넉넉히 잡은
 * 수가 아니라 필요한 수로 읽힌다.
 *
 * `edges` 의 배열 순서가 곧 간선을 펴는 순서다 — 저작이 고른 최악에 가까운
 * 순서이며, 그 전제는 `description.ts` 가 밝힌다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const repeatRelaxAllFacet: FacetJson = {
  id: 'facet:repeatRelaxAll',
  title: {
    en: 'Sweeping every edge, round after round',
    ko: '모든 간선을 거듭 펴기',
    ja: 'すべての辺を、巡るたびにゆるめる',
    zh: '一轮又一轮，扫过每一条边',
    ar: 'مسح كل حافة، جولة بعد جولة',
    es: 'Recorrer todas las aristas, ronda tras ronda',
    fr: 'Balayer toutes les arêtes, tour après tour',
    hi: 'हर किनारे पर बार-बार, चक्र दर चक्र',
    id: 'Menyapu setiap sisi, putaran demi putaran',
    pt: 'Varrer todas as arestas, rodada após rodada',
  },
  description: {
    en: 'Why one sweep is not enough: the front advances by exactly one node per round.',
    ko: '한 바퀴로 끝나지 않는 까닭 — 한 바퀴에 정보가 딱 한 칸만 나아간다.',
    ja: '一巡では終わらない理由 — 一巡で情報はちょうど一つ分しか進まない。',
    zh: '一轮为什么不够 — 每轮信息只往前推进一个顶点。',
    ar: 'لماذا لا تكفي جولة واحدة: تتقدم الجبهة بعقدة واحدة بالضبط في كل جولة.',
    es: 'Por qué una sola pasada no basta: el frente avanza exactamente un nodo por ronda.',
    fr: "Pourquoi un seul balayage ne suffit pas : le front n'avance que d'un sommet par tour.",
    hi: 'एक ही चक्र क्यों काफ़ी नहीं: हर चक्र में मोर्चा ठीक एक नोड आगे बढ़ता है।',
    id: 'Mengapa satu sapuan tidak cukup: garis depan maju tepat satu simpul tiap putaran.',
    pt: 'Por que uma varredura não basta: a frente avança exatamente um nó por rodada.',
  },
  algorithm: 'module:repeatRelaxAll',
  projector: 'module:repeatRelaxAllProjector',
  initialData: {
    type: 'repeat-relax-all',
    nodes: ['S', 'A', 'B', 'C', 'D'],
    // 간선을 펴는 순서. 사슬의 진행 방향과 정반대로 놓았다 — 이 순서가
    // 한 바퀴에 한 칸씩만 나아가게 만드는 장본인이다.
    edges: [
      { from: 'C', to: 'D', weight: 1 },
      { from: 'B', to: 'C', weight: 1 },
      { from: 'A', to: 'B', weight: 1 },
      { from: 'S', to: 'A', weight: 1 },
    ],
    source: 'S',
    // 읽을 것이 있는 걸음의 간격.
    stepMs: 700,
    // 헛도는 걸음의 간격. 아무 일도 없는 장면이라 읽을 시간이 덜 들고,
    // 빨리 지나가는 것 자체가 "헛수고" 로 읽힌다.
    idleStepMs: 380,
  },
  blocks: {
    stage: { type: 'repeat-relax-all-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'label.rounds': {
      en: 'rounds',
      ko: '바퀴',
      ja: '巡',
      zh: '轮',
      ar: 'جولات',
      es: 'rondas',
      fr: 'tours',
      hi: 'चक्र',
      id: 'putaran',
      pt: 'rodadas',
    },
    'caption.start': {
      en: 'Only {source} has a distance. Every other node is unknown.',
      ko: '{source}만 거리를 안다. 나머지는 아직 모르는 값이다.',
      ja: '距離が分かっているのは {source} だけ。ほかはまだ未知だ。',
      zh: '只有 {source} 有距离。其余顶点都还未知。',
      ar: '{source} وحده لديه مسافة. كل عقدة أخرى مجهولة.',
      es: 'Solo {source} tiene distancia. Los demás nodos son desconocidos.',
      fr: 'Seul {source} a une distance. Tous les autres sommets sont inconnus.',
      hi: 'सिर्फ़ {source} की दूरी पता है। बाकी हर नोड अज्ञात है।',
      id: 'Hanya {source} yang punya jarak. Simpul lain masih tak diketahui.',
      pt: 'Só {source} tem distância. Todos os outros nós são desconhecidos.',
    },
    'caption.skipUnknown': {
      en: '{edge}: {from} is still unknown, so nothing happens.',
      ko: '{edge} — {from}를 아직 몰라 아무 일도 일어나지 않는다.',
      ja: '{edge} — {from} がまだ未知なので、何も起きない。',
      zh: '{edge} — {from} 还未知，所以什么也没发生。',
      ar: '{edge}: ما زال {from} مجهولًا، فلا يحدث شيء.',
      es: '{edge}: {from} sigue siendo desconocido, así que no pasa nada.',
      fr: '{edge} : {from} est encore inconnu, donc rien ne se passe.',
      hi: '{edge} — {from} अब भी अज्ञात है, इसलिए कुछ नहीं होता।',
      id: '{edge}: {from} masih tak diketahui, jadi tidak terjadi apa-apa.',
      pt: '{edge}: {from} ainda é desconhecido, então nada acontece.',
    },
    'caption.skipNoGain': {
      en: '{edge}: no shorter route, so nothing happens.',
      ko: '{edge} — 더 짧아지지 않아 아무 일도 일어나지 않는다.',
      ja: '{edge} — もっと短くならないので、何も起きない。',
      zh: '{edge} — 没有更短的路，所以什么也没发生。',
      ar: '{edge}: لا مسار أقصر، فلا يحدث شيء.',
      es: '{edge}: no hay ruta más corta, así que no pasa nada.',
      fr: '{edge} : pas de chemin plus court, donc rien ne se passe.',
      hi: '{edge} — कोई छोटा रास्ता नहीं, इसलिए कुछ नहीं होता।',
      id: '{edge}: tidak ada rute yang lebih pendek, jadi tidak terjadi apa-apa.',
      pt: '{edge}: não há rota mais curta, então nada acontece.',
    },
    'caption.apply': {
      en: '{edge}: {to} becomes {dist}. The front moved one node.',
      ko: '{edge} — {to} 의 거리는 {dist}. 이 바퀴가 한 칸 밀어냈다.',
      ja: '{edge} — {to} の距離は {dist}。この一巡で一つ分だけ前へ出た。',
      zh: '{edge} — {to} 的距离是 {dist}。这一轮把前沿推进了一个顶点。',
      ar: '{edge}: صار {to} يساوي {dist}. تقدّمت الجبهة عقدة واحدة.',
      es: '{edge}: {to} pasa a {dist}. El frente avanzó un nodo.',
      fr: "{edge} : {to} devient {dist}. Le front a avancé d'un sommet.",
      hi: '{edge} — {to} की दूरी {dist} हो गई। मोर्चा एक नोड आगे बढ़ा।',
      id: '{edge}: {to} menjadi {dist}. Garis depan maju satu simpul.',
      pt: '{edge}: {to} passa a {dist}. A frente avançou um nó.',
    },
    'caption.roundEnd': {
      en: 'Round {round}: {applied} of {scans} scans did something.',
      ko: '{round}바퀴 끝 — {scans} 번 살펴 {applied} 번만 일이 됐다.',
      ja: '{round} 巡目の終わり — {scans} 回調べて、効いたのは {applied} 回だけ。',
      zh: '第 {round} 轮结束 — 查了 {scans} 次，只有 {applied} 次真起了作用。',
      ar: 'الجولة {round}: {applied} من أصل {scans} عملية فحص أحدثت شيئًا.',
      es: 'Ronda {round}: {applied} de {scans} revisiones hicieron algo.',
      fr: 'Tour {round} : {applied} vérifications sur {scans} ont servi à quelque chose.',
      hi: 'चक्र {round} — {scans} जाँचों में से केवल {applied} ने कुछ किया।',
      id: 'Putaran {round}: {applied} dari {scans} pemeriksaan membuahkan hasil.',
      pt: 'Rodada {round}: {applied} de {scans} verificações fizeram algo.',
    },
    'caption.done': {
      en: '{rounds} rounds for {nodes} nodes: the front moves one node per round, so only {applied} of {scans} scans mattered.',
      ko: '한 바퀴에 한 칸씩만 번지니 정점 {nodes} 개에 {rounds} 바퀴가 든다. 모두 {scans} 번 살펴 {applied} 번만 일이 됐다.',
      ja: '一巡で一つ分しか広がらないから、頂点 {nodes} 個に {rounds} 巡かかる。{scans} 回調べて、効いたのは {applied} 回だけ。',
      zh: '每轮只推进一个顶点，所以 {nodes} 个顶点要 {rounds} 轮。共查 {scans} 次，只有 {applied} 次起了作用。',
      ar: '{rounds} جولات لـ {nodes} عقد: تتقدم الجبهة عقدة واحدة في كل جولة، فلم يهمّ سوى {applied} من {scans} عملية فحص.',
      es: '{rounds} rondas para {nodes} nodos: el frente avanza un nodo por ronda, así que solo {applied} de {scans} revisiones contaron.',
      fr: "{rounds} tours pour {nodes} sommets : le front avance d'un sommet par tour, donc seules {applied} vérifications sur {scans} ont compté.",
      hi: '{nodes} नोड के लिए {rounds} चक्र: हर चक्र में मोर्चा एक नोड बढ़ता है, इसलिए {scans} जाँचों में से केवल {applied} ही काम आईं।',
      id: '{rounds} putaran untuk {nodes} simpul: garis depan maju satu simpul tiap putaran, jadi hanya {applied} dari {scans} pemeriksaan yang berarti.',
      pt: '{rounds} rodadas para {nodes} nós: a frente avança um nó por rodada, então só {applied} de {scans} verificações contaram.',
    },
  },
};
