/**
 * 시그모이드 — 끝없이 커지는 점수를 어떻게 0 과 1 사이의 확률로 바꾸는가.
 *
 * @piece 질문 하나에 답하고 멈춘다. 재료는 수직선 하나와 띠 하나뿐이며,
 *        점 무리도 결정 경계도 여기 없다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const squashToProbabilityFacet: FacetJson = {
  id: 'facet:squashToProbability',
  title: {
    en: 'Squashing a score into a probability',
    ko: '점수를 확률로 눌러 담기',
    ja: 'スコアを確率へ押し込める',
    zh: '把分数压成概率',
    ar: 'ضغط الدرجة إلى احتمال',
    es: 'Aplastar una puntuación en una probabilidad',
    fr: 'Écraser un score en probabilité',
    hi: 'स्कोर को संभाव्यता में दबाना',
    id: 'Memampatkan skor menjadi peluang',
    pt: 'Espremer uma pontuação numa probabilidade',
  },
  description: {
    en: 'An endless axis folded into the strip between 0 and 1.',
    ko: '끝없는 축이 0 과 1 사이의 띠로 접혀 든다.',
    ja: '果てのない軸が、0 と 1 のあいだの帯に折り畳まれる。',
    zh: '无尽的轴，被折进 0 与 1 之间的窄带里。',
    ar: 'محور لا نهاية له يُطوى في الشريط بين 0 و1.',
    es: 'Un eje sin fin plegado en la franja entre 0 y 1.',
    fr: 'Un axe sans fin replié dans la bande entre 0 et 1.',
    hi: 'एक अनंत अक्ष, 0 और 1 के बीच की पट्टी में मुड़ जाती है।',
    id: 'Sumbu tanpa ujung yang terlipat ke dalam pita antara 0 dan 1.',
    pt: 'Um eixo sem fim dobrado na faixa entre 0 e 1.',
  },
  algorithm: 'module:squashToProbability',
  projector: 'module:squashToProbabilityProjector',
  initialData: {
    type: 'squash-to-probability',
    /** 눌러 담을 점수. 자리는 그림이 셈하고 확률은 알고리즘이 셈한다. */
    scores: [-8, -4, -2, -1, 0, 1, 2, 4, 8],
    /** 걸음 간격. 읽을 시간을 주는 저작 결정이다 (S-piece). */
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'squash-to-probability-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.axis': {
      en: 'The score axis runs on without end, in both directions.',
      ko: '점수 축은 양쪽으로 끝없이 뻗는다.',
      ja: 'スコアの軸は両方向へ果てしなく伸びる。',
      zh: '分数轴向两边无止境地延伸。',
      ar: 'محور الدرجات يمتد بلا نهاية في الاتجاهين.',
      es: 'El eje de puntuaciones se extiende sin fin en ambas direcciones.',
      fr: "L'axe des scores s'étend sans fin dans les deux sens.",
      hi: 'स्कोर की अक्ष दोनों दिशाओं में बिना अंत के फैलती है।',
      id: 'Sumbu skor memanjang tanpa henti ke dua arah.',
      pt: 'O eixo das pontuações estende-se sem fim nos dois sentidos.',
    },
    'caption.band': {
      en: 'A probability may only sit between two walls.',
      ko: '확률이 앉을 자리는 두 벽 사이뿐이다.',
      ja: '確率が座れるのは二つの壁のあいだだけだ。',
      zh: '概率只能待在两堵墙之间。',
      ar: 'الاحتمال لا يجلس إلا بين جدارين.',
      es: 'Una probabilidad solo puede vivir entre dos muros.',
      fr: "Une probabilité ne peut se tenir qu'entre deux murs.",
      hi: 'संभाव्यता केवल दो दीवारों के बीच ही बैठ सकती है।',
      id: 'Peluang hanya boleh duduk di antara dua dinding.',
      pt: 'Uma probabilidade só pode ficar entre duas paredes.',
    },
    'caption.center': {
      en: 'The middle of the axis lands in the middle of the band: {p}.',
      ko: '축의 한가운데는 띠의 한가운데로 내려앉는다. 자리는 {p}.',
      ja: '軸の真ん中は帯の真ん中へ降りる。位置は {p}。',
      zh: '轴的正中落在带子的正中：{p}。',
      ar: 'منتصف المحور يحطّ في منتصف الشريط: {p}.',
      es: 'El centro del eje aterriza en el centro de la banda: {p}.',
      fr: "Le milieu de l'axe atterrit au milieu de la bande : {p}.",
      hi: 'अक्ष का बीच पट्टी के बीच पर उतरता है: {p}।',
      id: 'Tengah sumbu mendarat di tengah pita: {p}.',
      pt: 'O meio do eixo aterra no meio da faixa: {p}.',
    },
    'caption.squash': {
      en: 'z = {z} lands at {p}. A step of {dz} along the axis buys {dp} of the band.',
      ko: 'z = {z} → {p}. 축에서 벌린 거리 {dz}, 띠에서 얻은 폭 {dp}.',
      ja: 'z = {z} は {p} に降りる。軸で {dz} 動いて、帯で得た幅は {dp}。',
      zh: 'z = {z} 落在 {p}。轴上走了 {dz}，带上只换来 {dp}。',
      ar: 'z = {z} يحطّ عند {p}. خطوة {dz} على المحور تشتري {dp} من الشريط.',
      es: 'z = {z} cae en {p}. Un paso de {dz} en el eje compra {dp} de la banda.',
      fr: "z = {z} atterrit à {p}. Un pas de {dz} sur l'axe rapporte {dp} de la bande.",
      hi: 'z = {z}, {p} पर उतरता है। अक्ष पर {dz} का क़दम पट्टी में {dp} देता है।',
      id: 'z = {z} mendarat di {p}. Langkah {dz} di sumbu menghasilkan {dp} di pita.',
      pt: 'z = {z} cai em {p}. Um passo de {dz} no eixo rende {dp} da faixa.',
    },
    'caption.tails': {
      en: 'The rest of the axis presses into two slivers — and the walls stay out of reach: {lo} / {hi}.',
      ko: '축의 나머지 전부가 양 끝 자투리로 눌려 든다. 그래도 벽에 닿지는 못한다 — 끝의 두 값: {lo} / {hi}.',
      ja: '軸の残り全部が両端の細片に押し込まれる。それでも壁には届かない — 両端の値: {lo} / {hi}。',
      zh: '轴余下的全部都被压进两端的窄条里 — 而两堵墙始终够不着：{lo} / {hi}。',
      ar: 'بقية المحور تنضغط في شريحتين رفيعتين — ويظل الجداران بعيدين عن المنال: {lo} / {hi}.',
      es: 'El resto del eje se comprime en dos astillas, y los muros siguen fuera de alcance: {lo} / {hi}.',
      fr: "Tout le reste de l'axe se comprime en deux minces bandes — et les murs restent hors d'atteinte : {lo} / {hi}.",
      hi: 'अक्ष का बाक़ी सारा हिस्सा दो पतली फाँकों में सिमट जाता है — और दीवारें फिर भी पहुँच से बाहर रहती हैं: {lo} / {hi}।',
      id: 'Sisa sumbu tertekan menjadi dua serpih tipis — dan kedua dinding tetap tak tergapai: {lo} / {hi}.',
      pt: 'Todo o resto do eixo comprime-se em duas lascas — e as paredes continuam fora de alcance: {lo} / {hi}.',
    },
  },
};
