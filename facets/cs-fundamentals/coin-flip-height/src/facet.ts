/**
 * coin-flip-height — 층의 높이를 무엇이 정하는가.
 *
 * @piece 질문 하나에 답하고 멈추는 조각 (S-piece).
 *
 * 동전 결과가 1차 데이터다. 높이와 층별 노드 수는 algorithm 이 여기서 셈하고,
 * 그림의 좌표는 stage 가 캔버스에서 역산한다 — 선언에는 구조와 읽을 시간만 둔다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const coinFlipHeightFacet: FacetJson = {
  id: 'facet:coinFlipHeight',
  title: {
    en: 'What decides how high a tower goes',
    ko: '층의 높이를 무엇이 정하는가',
    ja: '塔の高さを決めるのは何か',
    zh: '是什么决定了塔的高度',
    ar: 'ما الذي يحدد ارتفاع البرج',
    es: 'Qué decide la altura de una torre',
    fr: 'Ce qui décide de la hauteur d\'une tour',
    hi: 'टावर की ऊँचाई कौन तय करता है',
    id: 'Apa yang menentukan tinggi menara',
    pt: 'O que decide a altura de uma torre',
  },
  description: {
    en: 'A coin flip decides each tower height, and the levels halve on their own.',
    ko: '동전 하나가 기둥의 높이를 정하고, 층은 저절로 절반씩 줄어든다.',
    ja: 'コイン投げが各塔の高さを決め、各層は自然に半分ずつ減る。',
    zh: '一次抛硬币决定每座塔的高度，各层自然减半。',
    ar: 'رمية عملة تحدد ارتفاع كل برج، وتتناقص الطبقات إلى النصف من تلقاء نفسها.',
    es: 'Una moneda decide la altura de cada torre y los niveles se reducen a la mitad solos.',
    fr: 'Un lancer de pièce décide la hauteur de chaque tour et les niveaux se réduisent de moitié tout seuls.',
    hi: 'एक सिक्का हर टावर की ऊँचाई तय करता है और हर स्तर अपने आप आधा रह जाता है।',
    id: 'Lemparan koin menentukan tinggi tiap menara, dan tiap tingkat menyusut separuh dengan sendirinya.',
    pt: 'Uma moeda decide a altura de cada torre e os níveis caem pela metade sozinhos.',
  },
  algorithm: 'module:coinFlipHeight',
  projector: 'module:coinFlipHeightProjector',
  initialData: {
    type: 'coin-flip-height',
    values: [3, 7, 12, 19, 25, 31, 38, 44, 50, 57, 63, 70],
    flips: [
      ['T'],
      ['T'],
      ['T'],
      ['T'],
      ['T'],
      ['H', 'H', 'T'],
      ['H', 'T'],
      ['H', 'H', 'T'],
      ['T'],
      ['H', 'T'],
      ['H', 'T'],
      ['H', 'H', 'T'],
    ],
    maxLevels: 4,
    stepMs: 600,
  },
  blocks: {
    stage: { type: 'coin-flip-height-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.stack': {
      en: 'Heads: {heads}. Tails stops it. Height: {height}.',
      ko: '앞면은 {heads}. 뒷면이 나와 멈춘다. 높이는 {height}.',
      ja: '表は {heads}。裏が出て止まる。高さは {height}。',
      zh: '正面 {heads} 次。出现反面就停。高度为 {height}。',
      ar: 'الوجه: {heads}. الظهر يوقفها. الارتفاع: {height}.',
      es: 'Caras: {heads}. La cruz lo detiene. Altura: {height}.',
      fr: 'Faces: {heads}. Pile arrête tout. Hauteur: {height}.',
      hi: 'हेड: {heads}. टेल आते ही रुक जाता है. ऊँचाई: {height}.',
      id: 'Sisi kepala: {heads}. Ekor menghentikannya. Tinggi: {height}.',
      pt: 'Caras: {heads}. A coroa faz parar. Altura: {height}.',
    },
    'caption.pack': {
      en: 'Line the levels up. Each level keeps about half.',
      ko: '층을 왼쪽으로 모은다. 한 층 오를 때마다 남는 것은 절반쯤.',
      ja: '各層を左に寄せる。一段上がるごとに残るのはおよそ半分。',
      zh: '把各层向左对齐。每上一层，留下的大约只有一半。',
      ar: 'اصطف الطبقات. كل طبقة تحتفظ بنحو النصف.',
      es: 'Alinea los niveles. Cada nivel conserva casi la mitad.',
      fr: 'Alignez les niveaux. Chaque niveau garde environ la moitié.',
      hi: 'स्तरों को बाईं ओर सजाएँ। हर स्तर पर लगभग आधा ही बचता है।',
      id: 'Sejajarkan tiap tingkat. Tiap tingkat menyisakan sekitar separuh.',
      pt: 'Alinhe os níveis. Cada nível guarda cerca de metade.',
    },
    'caption.done': {
      en: 'Nobody balanced the shape. The coin did.',
      ko: '모양을 맞춘 것은 아무도 없다. 동전이 했다.',
      ja: '形を整えた者はいない。コインがやった。',
      zh: '没有人去平衡这个形状，是硬币做的。',
      ar: 'لم يوازن أحد الشكل. العملة فعلت ذلك.',
      es: 'Nadie equilibró la forma. Lo hizo la moneda.',
      fr: 'Personne n\'a équilibré la forme. La pièce l\'a fait.',
      hi: 'किसी ने आकार को संतुलित नहीं किया। सिक्के ने किया।',
      id: 'Tidak ada yang menyeimbangkan bentuknya. Koin yang melakukannya.',
      pt: 'Ninguém equilibrou a forma. A moeda equilibrou.',
    },
  },
};
