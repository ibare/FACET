/**
 * silentTruncation — 그릇보다 큰 수를 담으면 윗자리가 조용히 떨어져 나간다.
 *
 * @piece 질문 하나에 답하고 멈추는 조각 (S-piece).
 *   "여덟 자리 그릇에 300 을 담으면 무엇이 남는가."
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const silentTruncationFacet: FacetJson = {
  id: 'facet:silentTruncation',

  title: {
    en: 'Silently truncated',
    ko: '잘려 나간 윗자리',
    ja: '静かに切り捨てられる上位ビット',
    zh: '被悄悄截断的高位',
    ar: 'اقتطاع صامت',
    es: 'Truncado en silencio',
    fr: 'Tronqué en silence',
    hi: 'चुपचाप कट गए ऊपरी बिट',
    id: 'Terpotong tanpa suara',
    pt: 'Truncado em silêncio',
  },

  description: {
    en: 'A value wider than its container loses its top bits, and nothing reports it.',
    ko: '그릇보다 큰 값은 윗자리를 잃는다. 그것을 알려 주는 것은 없다.',
    ja: '器より大きい値は上位ビットを失う。それを知らせるものは何もない。',
    zh: '超出容器的值会丢掉高位，而且没有任何提示。',
    ar: 'القيمة الأكبر من وعائها تفقد بتاتها العليا دون أي تنبيه.',
    es: 'Un valor más ancho que su contenedor pierde sus bits altos y nada lo avisa.',
    fr: 'Une valeur plus large que son conteneur perd ses bits de poids fort, sans aucun avertissement.',
    hi: 'पात्र से बड़ा मान अपने ऊपरी बिट खो देता है, और कोई चेतावनी नहीं मिलती।',
    id: 'Nilai yang lebih besar dari wadahnya kehilangan bit atasnya, tanpa peringatan apa pun.',
    pt: 'Um valor maior que o recipiente perde os bits altos, e nada avisa.',
  },

  algorithm: 'module:silentTruncation',
  projector: 'module:silentTruncationProjector',

  /*
   * 1차 데이터만 둔다 — 값과 두 비트 폭. 2진 표기 · 남는 값 · 떨어져 나간 값은
   * algorithm 이 셈하고, 그림의 좌표는 stage 가 캔버스에서 역산한다 (S-piece).
   */
  initialData: {
    type: 'silent-truncation',
    values: [300, 260, 511],
    width: 8,
    from: 16,
    stepMs: 700,
  },

  blocks: {
    stage: { type: 'silent-truncation-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },

  messages: {
    'caption.offer': {
      en: 'Counted in {from} bits: {value}.',
      ko: '{from}비트로 센 값: {value}.',
      ja: '{from} ビットで数えた値: {value}.',
      zh: '用 {from} 位计数的值：{value}。',
      ar: 'قيمة محسوبة بـ {from} بت: {value}.',
      es: 'Un valor contado en {from} bits: {value}.',
      fr: 'Une valeur comptée sur {from} bits : {value}.',
      hi: '{from} बिट में गिना गया मान: {value}.',
      id: 'Nilai yang dihitung dalam {from} bit: {value}.',
      pt: 'Um valor contado em {from} bits: {value}.',
    },
    'caption.pour': {
      en: 'The bowl takes only {width} bits. Hanging past the rim: {over}.',
      ko: '그릇이 받는 것은 {width}비트뿐. 테두리 밖에 걸린 자리: {over}.',
      ja: '器が受けるのは {width} ビットだけ。縁からはみ出した桁: {over}.',
      zh: '容器只装得下 {width} 位。挂在边缘外的高位：{over}。',
      ar: 'الوعاء يتسع لـ {width} بت فقط. المتدلي خارج الحافة: {over}.',
      es: 'El recipiente solo admite {width} bits. Fuera del borde quedan: {over}.',
      fr: 'Le récipient ne prend que {width} bits. Au-delà du bord : {over}.',
      hi: 'पात्र में केवल {width} बिट समाते हैं। किनारे से बाहर लटके: {over}.',
      id: 'Wadah hanya memuat {width} bit. Tergantung di luar tepi: {over}.',
      pt: 'O recipiente só aceita {width} bits. Para fora da borda ficam: {over}.',
    },
    'caption.truncate': {
      en: 'What fell away was worth {lost}. What stayed is {kept}.',
      ko: '떨어져 나간 값: {lost}. 그릇에 남은 값: {kept}.',
      ja: '落ちていった分の値: {lost}. 器に残った値: {kept}.',
      zh: '掉落的部分值为 {lost}。留在容器里的是 {kept}。',
      ar: 'ما سقط كانت قيمته {lost}. وما بقي هو {kept}.',
      es: 'Lo que cayó valía {lost}. Lo que quedó es {kept}.',
      fr: 'Ce qui est tombé valait {lost}. Ce qui reste est {kept}.',
      hi: 'जो गिरा उसका मान था {lost}. जो बचा वह है {kept}.',
      id: 'Yang jatuh bernilai {lost}. Yang tersisa adalah {kept}.',
      pt: 'O que caiu valia {lost}. O que ficou é {kept}.',
    },
    'caption.done': {
      en: 'No error, no warning at any step. What stayed: {results}.',
      ko: '어느 걸음에서도 오류도 경고도 없었다. 남은 값: {results}.',
      ja: 'どの段階でもエラーも警告も出なかった。残った値: {results}.',
      zh: '每一步都没有错误，也没有警告。留下的值：{results}。',
      ar: 'لا خطأ ولا تحذير في أي خطوة. ما بقي: {results}.',
      es: 'Ni un error ni un aviso en ningún paso. Lo que quedó: {results}.',
      fr: 'Ni erreur ni avertissement à aucune étape. Ce qui reste : {results}.',
      hi: 'किसी भी चरण में न कोई त्रुटि, न कोई चेतावनी। जो बचा: {results}.',
      id: 'Tidak ada galat, tidak ada peringatan di langkah mana pun. Yang tersisa: {results}.',
      pt: 'Nenhum erro, nenhum aviso em nenhum passo. O que ficou: {results}.',
    },
  },
};
