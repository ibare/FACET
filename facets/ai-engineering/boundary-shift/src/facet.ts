import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

/**
 * @piece 한 글자 차이로 — 자른 자리가 달라지면 뜻이 흔들린다.
 *
 * 답하는 질문 하나: **한 글자만 다른 두 낱말이 왜 전혀 다른 수의 토큰이 되는가.**
 *
 * `initialData` 에 두는 것은 말뭉치와 견줄 낱말 쌍뿐이다 — 어휘와 분할은
 * algorithm 이 셈하고, 좌표는 stage 가 캔버스에서 역산한다 (S-piece).
 *
 * BPE 가 어떻게 학습하는지, 빈칸을 어떻게 다루는지, 모르는 낱말을 어떻게 받는지는
 * 이 조각이 말하지 않는다.
 */
export const boundaryShiftFacet: FacetJson = {
  id: 'facet:boundaryShift',
  title: {
    en: 'One letter apart',
    ko: '한 글자 차이로',
    ja: '一文字の違いで',
    zh: '一个字母之差',
    ar: 'بفارق حرف واحد',
    es: 'A una letra de distancia',
    fr: 'A une lettre pres',
    hi: 'एक अक्षर के फर्क से',
    id: 'Beda satu huruf',
    pt: 'A uma letra de distancia',
  },
  description: {
    en: 'Change one letter and the token boundary collapses: a word that stood whole splits into three pieces.',
    ko: '글자 하나가 바뀌면 토큰 경계가 무너진다. 통째로 서 있던 낱말이 조각 셋으로 갈라진다.',
    ja: '文字を一つ変えるとトークンの境界が崩れ、ひとまとまりだった語が三つの断片に割れる。',
    zh: '改动一个字母，词元边界就塌了：原本完整的词裂成三块。',
    ar: 'يكفي تغيير حرف واحد حتى ينهار حد الترميز: كلمة كانت وحدة واحدة تنقسم إلى ثلاث قطع.',
    es: 'Cambia una letra y la frontera de tokens se derrumba: una palabra que estaba entera se parte en tres piezas.',
    fr: 'Changez une lettre et la frontiere des tokens cede : un mot entier se brise en trois morceaux.',
    hi: 'एक अक्षर बदलिए और टोकन की सीमा ढह जाती है: जो शब्द पूरा खड़ा था वह तीन टुकड़ों में बंट जाता है.',
    id: 'Ubah satu huruf dan batas token runtuh: kata yang tadinya utuh pecah menjadi tiga kepingan.',
    pt: 'Mude uma letra e a fronteira dos tokens desaba: uma palavra que estava inteira se parte em tres pecas.',
  },
  algorithm: 'module:boundaryShift',
  scene: 'module:boundaryShiftScene',
  initialData: {
    type: 'boundary-shift',
    /**
     * 1차 데이터 — 영어 낱말 29개와 빈도. 어휘는 여기서 자란다.
     */
    corpus: [
      { word: 'the', freq: 40 },
      { word: 'there', freq: 12 },
      { word: 'their', freq: 10 },
      { word: 'they', freq: 14 },
      { word: 'them', freq: 9 },
      { word: 'then', freq: 11 },
      { word: 'these', freq: 8 },
      { word: 'her', freq: 15 },
      { word: 'here', freq: 13 },
      { word: 'hers', freq: 5 },
      { word: 'he', freq: 20 },
      { word: 'his', freq: 16 },
      { word: 'him', freq: 10 },
      { word: 'what', freq: 9 },
      { word: 'that', freq: 18 },
      { word: 'than', freq: 8 },
      { word: 'this', freq: 14 },
      { word: 'thin', freq: 5 },
      { word: 'with', freq: 12 },
      { word: 'where', freq: 7 },
      { word: 'were', freq: 9 },
      { word: 'we', freq: 15 },
      { word: 'well', freq: 6 },
      { word: 'will', freq: 10 },
      { word: 'other', freq: 8 },
      { word: 'over', freq: 9 },
      { word: 'ever', freq: 7 },
      { word: 'every', freq: 6 },
      { word: 'even', freq: 7 },
    ],
    /**
     * 병합 횟수. 22 아래에서는 `that` 도 갈려 대비가 흐리고, 30 에서는
     * `there` · `this` 까지 통째가 되어 견줄 쌍이 줄어든다. 26 에서 한쪽이
     * 통째이면서 짝이 셋으로 부서지는 대비가 가장 크다.
     */
    merges: 26,
    /** 견줄 낱말 쌍 — 끝 글자 하나만 다른 것들. */
    pairs: [
      { left: 'here', right: 'hers' },
      { left: 'that', right: 'than' },
    ],
    stepMs: 850,
  },
  blocks: {
    stage: { type: 'boundary-shift-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.whole': {
      en: '"{word}" — pieces: {n}. It holds together.',
      ko: '"{word}" — 조각 수: {n}. 통째로 선다.',
      ja: '「{word}」— 断片数: {n}。一つのまとまりで立つ。',
      zh: '“{word}” — 片段数：{n}。整体不散。',
      ar: '"{word}" — القطع: {n}. يبقى كلمة واحدة.',
      es: '"{word}" — piezas: {n}. Se mantiene entero.',
      fr: '"{word}" — morceaux : {n}. Il tient en un seul bloc.',
      hi: '"{word}" — टुकड़े: {n}. यह एक ही टुकड़े में रहता है.',
      id: '"{word}" — kepingan: {n}. Tetap utuh.',
      pt: '"{word}" — pecas: {n}. Permanece inteiro.',
    },
    'caption.swap': {
      en: 'One letter changes: "{from}" becomes "{to}".',
      ko: '글자 하나가 바뀐다: "{from}" → "{to}".',
      ja: '文字が一つ変わる: 「{from}」→「{to}」。',
      zh: '一个字母变了：“{from}” → “{to}”。',
      ar: 'يتغير حرف واحد: "{from}" يصبح "{to}".',
      es: 'Cambia una letra: "{from}" pasa a "{to}".',
      fr: 'Une lettre change : "{from}" devient "{to}".',
      hi: 'एक अक्षर बदलता है: "{from}" बनता है "{to}".',
      id: 'Satu huruf berubah: "{from}" menjadi "{to}".',
      pt: 'Uma letra muda: "{from}" vira "{to}".',
    },
    'caption.shatter': {
      en: 'The boundary gives way — pieces: {n}.',
      ko: '경계가 갈라진다 — 조각 수: {n}.',
      ja: '境界が崩れる — 断片数: {n}。',
      zh: '边界塌了 — 片段数：{n}。',
      ar: 'ينهار الحد — القطع: {n}.',
      es: 'La frontera cede — piezas: {n}.',
      fr: 'La frontiere cede — morceaux : {n}.',
      hi: 'सीमा टूट जाती है — टुकड़े: {n}.',
      id: 'Batas itu runtuh — kepingan: {n}.',
      pt: 'A fronteira cede — pecas: {n}.',
    },
    'caption.done': {
      en: 'One letter apart, yet the cuts fall differently.',
      ko: '한 글자 차이인데 잘리는 자리가 다르다.',
      ja: '一文字違うだけで、切れ目の場所が変わる。',
      zh: '只差一个字母，切分的位置却不同。',
      ar: 'حرف واحد فقط يفرق بينهما، ومع ذلك تختلف مواضع القطع.',
      es: 'Una sola letra de diferencia y los cortes caen en otro sitio.',
      fr: 'Une seule lettre de difference, et les coupes tombent ailleurs.',
      hi: 'सिर्फ एक अक्षर का अंतर, फिर भी कटने की जगह बदल जाती है.',
      id: 'Hanya beda satu huruf, tetapi tempat pemotongannya berbeda.',
      pt: 'Apenas uma letra de diferenca, e os cortes caem em outro lugar.',
    },
  },
};
