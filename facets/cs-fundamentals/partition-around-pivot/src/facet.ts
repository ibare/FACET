/**
 * @piece 피벗 분할 — 가르고 나면 정렬된 것인가?
 *
 * 질문 하나에 답하고 멈춘다. 값들이 같은 기준 하나와 한 번씩 견주어 좌우로
 * 건너가고, 기준은 건너지 않고 경계에 남아 자리가 확정된다. 각 쪽 안은 여전히
 * 들어온 순서 그대로다.
 *
 * 조각이므로 header / metrics / layout 을 두지 않는다 (S-piece).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const partitionAroundPivotFacet: FacetJson = {
  id: 'facet:partitionAroundPivot',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: {
    en: 'Partitioning',
    ko: '피벗 분할',
    ja: 'パーティション分割',
    zh: '划分',
    ar: 'التقسيم',
    es: 'Partición',
    fr: 'Partitionnement',
    hi: 'विभाजन',
    id: 'Pembelahan',
    pt: 'Particionamento',
  },
  description: {
    en: 'Each value is compared with the same pivot and crosses to one side. The pivot itself stays on the line.',
    ko: '값마다 같은 기준 하나와 견주어 한쪽으로 건너간다. 기준 자신은 선에 남는다.',
    ja: '値ごとに同じ基準ひとつと見比べ、どちらかへ渡る。基準そのものは線に残る。',
    zh: '每个值都与同一个基准相比，然后越到一侧。基准本身留在线上。',
    ar: 'كل قيمة تُقارَن بالمحور نفسه وتعبر إلى أحد الجانبين. أما المحور فيبقى على الخط.',
    es: 'Cada valor se compara con el mismo pivote y cruza a un lado. El pivote se queda en la línea.',
    fr: "Chaque valeur est comparée au même pivot et passe d'un côté. Le pivot, lui, reste sur la ligne.",
    hi: 'हर मान की तुलना उसी एक धुरी से होती है और वह किसी एक ओर चला जाता है। धुरी स्वयं रेखा पर ही रहती है।',
    id: 'Tiap nilai dibandingkan dengan pivot yang sama lalu menyeberang ke satu sisi. Pivotnya sendiri tetap di garis.',
    pt: 'Cada valor é comparado com o mesmo pivô e atravessa para um lado. O pivô fica na linha.',
  },
  algorithm: 'module:partitionAroundPivot',
  projector: 'module:partitionAroundPivotProjector',
  initialData: {
    type: 'partition-around-pivot',
    values: [7, 2, 9, 3, 8],
    pivot: 5,
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'partition-around-pivot-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
  messages: {
    'caption.intro': {
      en: 'Every value meets the same pivot {pivot}.',
      ko: '값마다 같은 기준 {pivot} 하나와 견준다.',
      ja: 'どの値も同じ基準 {pivot} と向き合う。',
      zh: '每个值都与同一个基准 {pivot} 相遇。',
      ar: 'كل قيمة تلتقي المحور نفسه {pivot}.',
      es: 'Cada valor se enfrenta al mismo pivote {pivot}.',
      fr: 'Chaque valeur rencontre le même pivot {pivot}.',
      hi: 'हर मान उसी एक धुरी {pivot} से मिलता है।',
      id: 'Setiap nilai bertemu pivot yang sama, {pivot}.',
      pt: 'Cada valor encontra o mesmo pivô {pivot}.',
    },
    'caption.less': {
      en: '{value} < {pivot} — it crosses to the left.',
      ko: '{value} < {pivot} — 왼쪽으로 건너간다.',
      ja: '{value} < {pivot} — 左へ渡る。',
      zh: '{value} < {pivot} — 越到左边。',
      ar: '{value} < {pivot} — يعبر إلى اليسار.',
      es: '{value} < {pivot}: cruza a la izquierda.',
      fr: '{value} < {pivot} — il passe à gauche.',
      hi: '{value} < {pivot} — यह बाईं ओर चला जाता है।',
      id: '{value} < {pivot} — ia menyeberang ke kiri.',
      pt: '{value} < {pivot} — atravessa para a esquerda.',
    },
    'caption.greater': {
      en: '{value} > {pivot} — it crosses to the right.',
      ko: '{value} > {pivot} — 오른쪽으로 건너간다.',
      ja: '{value} > {pivot} — 右へ渡る。',
      zh: '{value} > {pivot} — 越到右边。',
      ar: '{value} > {pivot} — يعبر إلى اليمين.',
      es: '{value} > {pivot}: cruza a la derecha.',
      fr: '{value} > {pivot} — il passe à droite.',
      hi: '{value} > {pivot} — यह दाईं ओर चला जाता है।',
      id: '{value} > {pivot} — ia menyeberang ke kanan.',
      pt: '{value} > {pivot} — atravessa para a direita.',
    },
    'caption.pivotFinal': {
      en: 'The pivot never crossed. Its place is settled.',
      ko: '기준은 건너지 않았다. 이 자리가 확정된다.',
      ja: '基準は渡らなかった。この場所が確定する。',
      zh: '基准没有越过去。它的位置就此定下。',
      ar: 'المحور لم يعبر. موضعه استقرّ.',
      es: 'El pivote no cruzó. Su lugar queda fijado.',
      fr: "Le pivot n'a pas traversé. Sa place est fixée.",
      hi: 'धुरी पार नहीं गई। उसकी जगह तय हो गई।',
      id: 'Pivotnya tidak menyeberang. Tempatnya sudah pasti.',
      pt: 'O pivô não atravessou. O lugar dele está definido.',
    },
    'caption.done': {
      en: '{less} on the left, {greater} on the right — split, not sorted.',
      ko: '왼쪽 {less}개, 오른쪽 {greater}개 — 갈렸을 뿐 정렬은 아니다.',
      ja: '左に {less} 個、右に {greater} 個 — 分かれただけで、並べ替えではない。',
      zh: '左边 {less} 个，右边 {greater} 个 — 只是分开了，并没有排好序。',
      ar: '{less} على اليسار و{greater} على اليمين — انقسام لا ترتيب.',
      es: '{less} a la izquierda, {greater} a la derecha: separado, no ordenado.',
      fr: '{less} à gauche, {greater} à droite — séparé, pas trié.',
      hi: 'बाईं ओर {less}, दाईं ओर {greater} — बँटा है, क्रम में नहीं लगा।',
      id: '{less} di kiri, {greater} di kanan — terbelah, bukan terurut.',
      pt: '{less} à esquerda, {greater} à direita — separado, não ordenado.',
    },
  },
};
