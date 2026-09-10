/**
 * @piece 정렬된 두 줄을 합칠 때 다시 정렬하는가?
 *
 * 하지 않는다 — 양쪽이 이미 줄 서 있으므로 맨 앞 둘만 견주면 다음에 올 것이
 * 확정된다. 이긴 쪽이 아래 결과줄로 내려가고, 뒤쪽은 한 번도 읽히지 않는다.
 *
 * header 도 metrics 도 layout 도 두지 않는다. 제목은 글의 문단이 주고, 셀 것은
 * 없으며, 배치는 stage 와 controls 뿐이라 러너가 정한다 (S-piece).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const mergeTwoSortedFacet: FacetJson = {
  id: 'facet:mergeTwoSorted',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: {
    en: 'Merging',
    ko: '병합',
    ja: 'マージ',
    zh: '归并',
    ar: 'الدمج',
    es: 'Fusión',
    fr: 'Fusion',
    hi: 'विलय',
    id: 'Penggabungan',
    pt: 'Fusão',
  },
  description: {
    en: 'Two ordered rows become one — by looking only at the two fronts.',
    ko: '줄 선 둘이 하나가 된다 — 맨 앞 둘만 보고서.',
    ja: '並んだ二列が一つになる — 先頭の二つだけを見て。',
    zh: '两条有序的行合成一条 — 只看两个队首。',
    ar: 'صفّان مرتّبان يصيران واحدًا — بالنظر إلى المقدمتين فقط.',
    es: 'Dos filas ordenadas se hacen una, mirando solo los dos frentes.',
    fr: "Deux rangées triées n'en font plus qu'une — en ne regardant que les deux têtes.",
    hi: 'दो क्रमित पंक्तियाँ एक बन जाती हैं — बस दोनों के अगले सिरे देखकर।',
    id: 'Dua baris terurut menjadi satu — hanya dengan melihat dua kepala barisan.',
    pt: 'Duas filas ordenadas viram uma — olhando apenas as duas frentes.',
  },
  algorithm: 'module:mergeTwoSorted',
  projector: 'module:mergeTwoSortedProjector',
  initialData: {
    type: 'merge-two-sorted',
    left: [1, 4, 7],
    right: [2, 3, 9],
    // 걸음 간격. 무대의 이동 애니메이션이 이 위에 더해진다 (S-piece).
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'merge-two-sorted-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.premise': {
      en: 'Both rows are already in order.',
      ko: '두 줄 모두 이미 정렬돼 있다.',
      ja: '二列とも、すでに並んでいる。',
      zh: '两行都已经是有序的。',
      ar: 'كلا الصفين مرتّب أصلًا.',
      es: 'Las dos filas ya están ordenadas.',
      fr: 'Les deux rangées sont déjà triées.',
      hi: 'दोनों पंक्तियाँ पहले से क्रम में हैं।',
      id: 'Kedua baris sudah terurut.',
      pt: 'As duas filas já estão ordenadas.',
    },
    'caption.compare': {
      en: 'Only the fronts are compared: {left} vs {right}',
      ko: '맨 앞끼리만 견준다 — {left} 대 {right}',
      ja: '見比べるのは先頭どうしだけ — {left} と {right}',
      zh: '只比队首：{left} 对 {right}',
      ar: 'تُقارن المقدمتان فقط: {left} مقابل {right}',
      es: 'Solo se comparan los frentes: {left} contra {right}',
      fr: 'On ne compare que les têtes : {left} contre {right}',
      hi: 'सिर्फ़ अगले सिरे भिड़ते हैं: {left} बनाम {right}',
      id: 'Yang dibandingkan hanya kepala barisan: {left} lawan {right}',
      pt: 'Só as frentes são comparadas: {left} contra {right}',
    },
    'caption.take': {
      en: 'The smaller front is {value} — down it goes',
      ko: '더 작은 쪽은 {value} — 아래로 내려간다',
      ja: '小さいほうは {value} — 下へ降りる',
      zh: '较小的是 {value} — 落到下面去',
      ar: 'الأصغر هو {value} — ينزل إلى الأسفل',
      es: 'El frente menor es {value}: baja',
      fr: 'La plus petite tête est {value} — elle descend',
      hi: 'छोटा सिरा {value} है — यह नीचे चला जाता है',
      id: 'Yang lebih kecil {value} — turun ke bawah',
      pt: 'A frente menor é {value} — desce',
    },
    'caption.drain': {
      en: 'Nothing left to compare — the rest just follows down',
      ko: '견줄 상대가 없다 — 남은 것은 그대로 따라 내려간다',
      ja: '見比べる相手がいない — 残りはそのまま降りる',
      zh: '没有可比的了 — 剩下的直接跟着落下',
      ar: 'لم يبق ما يُقارن — والباقي ينزل كما هو',
      es: 'No queda con qué comparar: el resto baja tal cual',
      fr: 'Plus rien à comparer — le reste suit simplement',
      hi: 'तुलना के लिए कुछ नहीं बचा — बाकी बस पीछे-पीछे उतर आता है',
      id: 'Tak ada lagi yang dibandingkan — sisanya tinggal ikut turun',
      pt: 'Não há mais o que comparar — o resto apenas desce',
    },
    'caption.done': {
      en: 'One pass, {comparisons} comparisons, and nothing was re-sorted',
      ko: '한 번 훑어 끝났다 — 견줌 {comparisons}회, 다시 정렬한 적 없다',
      ja: '一度通しただけ — 見比べ {comparisons} 回、並べ直しは一度もない',
      zh: '走了一遍，比较 {comparisons} 次，一次都没有重新排序',
      ar: 'مرور واحد، و{comparisons} مقارنة، ولم يُعد ترتيب شيء',
      es: 'Una sola pasada, {comparisons} comparaciones, y no se reordenó nada',
      fr: "Un seul passage, {comparisons} comparaisons, et rien n'a été retrié",
      hi: 'एक ही चक्कर, {comparisons} तुलनाएँ, और दोबारा क्रम कभी नहीं लगाया गया',
      id: 'Sekali jalan, {comparisons} perbandingan, dan tak ada yang diurutkan ulang',
      pt: 'Uma passagem, {comparisons} comparações, e nada foi reordenado',
    },
  },
};
