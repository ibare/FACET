/**
 * @piece 글자와 낱말 사이 — 낱말도 글자도 아닌 크기로 자른다.
 *
 * 한 문장을 세 가지 크기로 자르고, 자르는 자리가 옮겨 가며 조각 수가 벌어지는
 * 것을 보인다. 어휘를 **어떻게 얻는지**는 여기서 말하지 않는다 — 학습·병합·빈도는
 * 다른 조각의 몫이고, 캡션이 둘이면 조각이 둘이라는 신호다 (S-piece).
 *
 * 선언에 두는 것은 말뭉치와 병합 횟수와 문장뿐이다. 낱말 6 · 조각 9 · 글자 28 은
 * algorithm 이 셈한다.
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const betweenLetterAndWordFacet: FacetJson = {
  id: 'facet:betweenLetterAndWord',
  title: {
    en: 'Between letter and word',
    ko: '글자와 낱말 사이',
    ja: '文字と単語のあいだ',
    zh: '字母与单词之间',
    ar: 'بين الحرف والكلمة',
    es: 'Entre letra y palabra',
    fr: 'Entre lettre et mot',
    hi: 'अक्षर और शब्द के बीच',
    id: 'Antara huruf dan kata',
    pt: 'Entre letra e palavra',
  },
  description: {
    en: 'One sentence cut three ways — pieces land between letters and words.',
    ko: '한 문장을 세 가지 크기로 자른다 — 조각은 글자와 낱말 사이에 내려앉는다.',
    ja: '一つの文を三つの大きさで切る — かけらは文字と単語のあいだに落ち着く。',
    zh: '同一个句子切成三种大小 — 片段落在字母与单词之间。',
    ar: 'جملة واحدة تُقطَّع بثلاثة مقاييس — القطع تقع بين الحرف والكلمة.',
    es: 'Una frase cortada de tres maneras: las piezas caen entre letras y palabras.',
    fr: 'Une phrase découpée de trois façons : les morceaux tombent entre lettres et mots.',
    hi: 'एक ही वाक्य तीन आकारों में कटता है — टुकड़े अक्षर और शब्द के बीच आते हैं।',
    id: 'Satu kalimat dipotong tiga cara — kepingan jatuh di antara huruf dan kata.',
    pt: 'Uma frase cortada de três formas — os pedaços ficam entre letras e palavras.',
  },
  algorithm: 'module:betweenLetterAndWord',
  projector: 'module:betweenLetterAndWordProjector',
  initialData: {
    type: 'between-letter-and-word',
    sentence: 'the worker is walking and talking',
    // 어휘를 만든 말뭉치. 빈도까지가 1차 데이터다.
    corpus: [
      { word: 'the', freq: 30 },
      { word: 'and', freq: 22 },
      { word: 'is', freq: 18 },
      { word: 'of', freq: 14 },
      { word: 'walking', freq: 9 },
      { word: 'walked', freq: 7 },
      { word: 'walker', freq: 5 },
      { word: 'walks', freq: 4 },
      { word: 'talking', freq: 8 },
      { word: 'talked', freq: 6 },
      { word: 'talker', freq: 3 },
      { word: 'talks', freq: 5 },
      { word: 'working', freq: 9 },
      { word: 'worked', freq: 8 },
      { word: 'worker', freq: 6 },
      { word: 'works', freq: 7 },
      { word: 'looking', freq: 7 },
      { word: 'looked', freq: 6 },
      { word: 'looker', freq: 2 },
      { word: 'looks', freq: 5 },
    ],
    // 이 수를 바꾸면 조각 수가 따라 바뀐다. 30 이상이면 낱말이 통째로 어휘에 들어
    // 조각 수가 낱말 수에 붙고, 22 이하면 worker 가 work + e + r 로 부스러진다.
    merges: 26,
    stepMs: 800,
  },
  blocks: {
    stage: { type: 'between-letter-and-word-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.word': {
      en: 'Cut at the spaces — words {n}.',
      ko: '빈칸에서 자른다 — 낱말 {n}.',
      ja: '空白で切る — 単語 {n}。',
      zh: '在空格处切 — 单词 {n}。',
      ar: 'القطع عند المسافات — الكلمات {n}.',
      es: 'Cortado en los espacios: palabras {n}.',
      fr: 'Coupé aux espaces : mots {n}.',
      hi: 'खाली जगह पर काटा — शब्द {n}।',
      id: 'Dipotong di spasi — kata {n}.',
      pt: 'Cortado nos espaços — palavras {n}.',
    },
    'caption.piece': {
      en: 'Same sentence, cut into pieces — pieces {n}.',
      ko: '같은 문장을 조각으로 자른다 — 조각 {n}.',
      ja: '同じ文をかけらに切る — かけら {n}。',
      zh: '同一句话切成片段 — 片段 {n}。',
      ar: 'الجملة نفسها تُقطَّع إلى قطع — القطع {n}.',
      es: 'La misma frase, cortada en piezas: piezas {n}.',
      fr: 'La même phrase, coupée en morceaux : morceaux {n}.',
      hi: 'वही वाक्य टुकड़ों में कटा — टुकड़े {n}।',
      id: 'Kalimat yang sama, dipotong jadi kepingan — kepingan {n}.',
      pt: 'A mesma frase, cortada em pedaços — pedaços {n}.',
    },
    'caption.letter': {
      en: 'Cut at every letter — letters {n}.',
      ko: '글자마다 자른다 — 글자 {n}.',
      ja: '一文字ごとに切る — 文字 {n}。',
      zh: '每个字母都切 — 字母 {n}。',
      ar: 'القطع عند كل حرف — الحروف {n}.',
      es: 'Cortado en cada letra: letras {n}.',
      fr: 'Coupé à chaque lettre : lettres {n}.',
      hi: 'हर अक्षर पर काटा — अक्षर {n}।',
      id: 'Dipotong di tiap huruf — huruf {n}.',
      pt: 'Cortado em cada letra — letras {n}.',
    },
    'caption.between': {
      en: 'Pieces land in between — words {word}, pieces {piece}, letters {letter}.',
      ko: '조각은 그 사이에 내려앉는다 — 낱말 {word}, 조각 {piece}, 글자 {letter}.',
      ja: 'かけらはそのあいだに落ち着く — 単語 {word}、かけら {piece}、文字 {letter}。',
      zh: '片段落在两者之间 — 单词 {word}，片段 {piece}，字母 {letter}。',
      ar: 'القطع تقع بين الاثنين — الكلمات {word}، القطع {piece}، الحروف {letter}.',
      es: 'Las piezas quedan en medio: palabras {word}, piezas {piece}, letras {letter}.',
      fr: 'Les morceaux se placent entre les deux : mots {word}, morceaux {piece}, lettres {letter}.',
      hi: 'टुकड़े बीच में आते हैं — शब्द {word}, टुकड़े {piece}, अक्षर {letter}।',
      id: 'Kepingan berada di antaranya — kata {word}, kepingan {piece}, huruf {letter}.',
      pt: 'Os pedaços ficam no meio — palavras {word}, pedaços {piece}, letras {letter}.',
    },
  },
};
