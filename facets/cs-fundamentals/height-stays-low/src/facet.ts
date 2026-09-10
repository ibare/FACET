/**
 * HeightStaysLow facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "가지 하나가 자식을 몇 개씩 두느냐가 왜 나무 높이를 정하는가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 + 한 걸음 둘) / 제목 없음 / 한 주장 /
 * 메트릭 없음 / 캔버스 폭은 러너가 정함(PIECE_CANVAS_W) / 전제는 이 글이 밝힌다.
 *
 * 데이터는 실측이 아니라 계산이다 — 자식 수(2, 100)와 목표 잎 수(1,000,000)만
 * 선언하고, 몇 층을 내려가야 하는지는 algorithm 이 실제로 곱해 나가며 찾는다
 * (호스트가 미리 확정한 값: 자식 2개는 21층, 자식 100개는 4층).
 *
 * title / description / messages 는 열 개 언어를 채웠다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const heightStaysLowFacet: FacetJson = {
  id: 'facet:heightStaysLow',
  title: {
    en: 'Height Stays Low',
    ko: '낮은 트리 높이',
    ja: '木の高さは低いまま',
    zh: '高度保持在低位',
    ar: 'الارتفاع يبقى منخفضًا',
    es: 'La altura se mantiene baja',
    fr: 'La hauteur reste basse',
    hi: 'ऊँचाई कम ही रहती है',
    id: 'Tinggi Tetap Rendah',
    pt: 'A altura permanece baixa',
  },
  description: {
    en: 'Two trees cover the same million leaves — the wider one finishes in far fewer levels',
    ko: '같은 백만 개의 잎을 두 나무가 덮는다 — 가지가 넓은 쪽이 훨씬 적은 층으로 끝난다',
    ja: '二本の木が同じ百万枚の葉を覆う — 枝が広いほうがはるかに少ない段で終わる',
    zh: '两棵树覆盖同样的一百万片叶子 — 分叉更宽的那棵用少得多的层数就结束',
    ar: 'شجرتان تغطيان المليون ورقة نفسها — والأوسع تفرعًا تنتهي بمستويات أقل بكثير',
    es: 'Dos árboles cubren el mismo millón de hojas: el más ancho termina en muchos menos niveles',
    fr: "Deux arbres couvrent le même million de feuilles — le plus large s'arrête bien plus tôt en niveaux",
    hi: 'दो पेड़ उन्हीं दस लाख पत्तियों को ढँकते हैं — जिसकी शाखाएँ चौड़ी हैं वह कहीं कम स्तरों में पूरा हो जाता है',
    id: 'Dua pohon menutupi sejuta daun yang sama — yang cabangnya lebih lebar selesai dalam jauh lebih sedikit tingkat',
    pt: 'Duas árvores cobrem o mesmo milhão de folhas — a mais larga termina em muito menos níveis',
  },
  algorithm: 'module:heightStaysLow',
  projector: 'module:heightStaysLowProjector',
  initialData: {
    type: 'height-stays-low',
    algorithmLabel: 'level walk',
    // 호스트가 확정한 실측값. 자식 수 둘과 목표 잎 수만 선언하고, 층수는
    // algorithm 이 곱해 나가며 계산한다 — 21층(자식 2개) / 4층(자식 100개).
    target: 1_000_000,
    branchA: 2,
    branchB: 100,
    stepMs: 700,
  },
  shuffleOnReset: false,
  messages: {
    'caption.goal': {
      en: 'Both trees have to cover the same {target} leaves.',
      ko: '두 나무 모두 같은 {target}장의 잎을 덮어야 한다.',
      ja: 'どちらの木も同じ {target} 枚の葉を覆わねばならない。',
      zh: '两棵树都要覆盖同样的 {target} 片叶子。',
      ar: 'على الشجرتين تغطية {target} ورقة نفسها.',
      es: 'Ambos árboles deben cubrir las mismas {target} hojas.',
      fr: 'Les deux arbres doivent couvrir les mêmes {target} feuilles.',
      hi: 'दोनों पेड़ों को वही {target} पत्तियाँ ढँकनी हैं।',
      id: 'Kedua pohon harus menutupi {target} daun yang sama.',
      pt: 'As duas árvores têm de cobrir as mesmas {target} folhas.',
    },
    'caption.result': {
      en: '{a} levels down on one side, {b} on the other — same leaves, same walk to read.',
      ko: '한쪽은 {a} 층, 다른 쪽은 {b} 층 — 같은 잎을 덮는데도 밟는 걸음이 다르다.',
      ja: '片方は {a} 段、もう片方は {b} 段 — 同じ葉を覆うのに歩数が違う。',
      zh: '一边 {a} 层，另一边 {b} 层 — 覆盖同样的叶子，走的步数却不同。',
      ar: '{a} مستوى في جهة و{b} في الأخرى — الأوراق نفسها، لكن عدد الخطوات مختلف.',
      es: '{a} niveles de un lado y {b} del otro: las mismas hojas, distinto recorrido.',
      fr: "{a} niveaux d'un côté, {b} de l'autre — les mêmes feuilles, mais pas le même parcours.",
      hi: 'एक ओर {a} स्तर, दूसरी ओर {b} — पत्तियाँ वही, पर चलना अलग।',
      id: '{a} tingkat di satu sisi, {b} di sisi lain — daun yang sama, langkah yang berbeda.',
      pt: '{a} níveis de um lado, {b} do outro — as mesmas folhas, mas caminhada diferente.',
    },
  },
  blocks: {
    stage: { type: 'height-stays-low-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
