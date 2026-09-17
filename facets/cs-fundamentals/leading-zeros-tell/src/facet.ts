/**
 * facet:leadingZerosTell — 서로 다른 것이 몇 개나 지나갔는지 재는 법.
 *
 * @piece 드문 것을 봤다면 많이 본 것이다. 앞자리 0 이 더 긴 것이 오면 눈금이
 * 한 칸 올라서고, 끝에 남은 눈금 하나가 얼마나 많이 봤는지를 말한다.
 *
 * `keys` 의 차례는 **저작 결정**이다 — ρ 오름차순으로 세워 눈금이 계단처럼
 * 올라가는 것을 보인다. 데이터가 정하는 차례가 아니므로 선언에 적는다.
 * 이진 32자리는 murmur3 32bit (seed 0) 로 실측한 값이고, 앞자리 0 의 개수와
 * ρ 와 추정값은 **장면이 그 비트에서 센다** — 선언에도 발신에도 적지 않는다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const leadingZerosTellFacet: FacetJson = {
  id: 'facet:leadingZerosTell',
  title: {
    en: 'Leading zeros tell the count',
    ko: '앞자리 0 이 개수를 말한다',
    ja: '先頭のゼロが個数を告げる',
    zh: '前导零告诉你有多少',
    ar: 'الأصفار البادئة تخبرك بالعدد',
    es: 'Los ceros iniciales dicen cuántos son',
    fr: 'Les zéros de tête disent le nombre',
    hi: 'शुरुआती शून्य गिनती बताते हैं',
    id: 'Nol di depan memberi tahu jumlahnya',
    pt: 'Os zeros iniciais dizem quantos são',
  },
  description: {
    en: 'A rare run of zeros means you have seen many — count distinct items without keeping any of them.',
    ko: '드문 0 앞자리를 봤다면 많이 본 것이다 — 본 것을 하나도 간직하지 않고 서로 다른 것의 수를 잰다.',
    ja: 'まれなゼロの並びを見たなら、それだけ多くを見たということ — 何ひとつ保存せずに異なりの数を測る。',
    zh: '看到罕见的前导零，说明你已经见过很多 — 不保存任何元素也能估计不同元素的个数。',
    ar: 'رؤية سلسلة نادرة من الأصفار تعني أنك رأيت الكثير — نقدر عدد العناصر المختلفة دون حفظ أي منها.',
    es: 'Ver una racha rara de ceros significa que has visto muchos: cuenta elementos distintos sin guardar ninguno.',
    fr: 'Voir une rare suite de zéros signifie que vous en avez vu beaucoup : comptez les éléments distincts sans en garder aucun.',
    hi: 'शून्यों की दुर्लभ श्रृंखला दिखी तो आपने बहुत कुछ देखा है — बिना कुछ संचित किए अलग-अलग वस्तुओं की गिनती।',
    id: 'Melihat deretan nol yang langka berarti Anda sudah melihat banyak — hitung item berbeda tanpa menyimpan satu pun.',
    pt: 'Ver uma sequência rara de zeros significa que você já viu muitos — conte itens distintos sem guardar nenhum.',
  },
  algorithm: 'module:leadingZerosTell',
  scene: 'module:leadingZerosTellScene',
  initialData: {
    type: 'leading-zeros-tell',
    stepMs: 640,
    keys: [
      { key: 'kiwi', bits: '10010111101101001110100011000011' },
      { key: 'elder', bits: '10001011000100011111010000110011' },
      { key: 'cherry', bits: '11111001101001010001000110111010' },
      { key: 'banana', bits: '11110101011000100010101110101111' },
      { key: 'apple', bits: '01110000000101101110100010010000' },
      { key: 'mango', bits: '01011111100010000111110000101001' },
      { key: 'fig', bits: '00110111000001010110101100101011' },
      { key: 'date', bits: '00101010110100011111001100011011' },
    ],
  },
  blocks: {
    stage: { type: 'leading-zeros-tell-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
  messages: {
    'caption.rise': {
      en: 'The first 1 sits at {p}. Higher than the notch — it steps up.',
      ko: '첫 1 의 자리는 {p}. 눈금보다 높아 한 칸 올라선다.',
      ja: '最初の 1 の位置は {p}。目盛りより高いので一段上がる。',
      zh: '第一个 1 在第 {p} 位。比刻度更高，刻度上移一格。',
      ar: 'أول 1 في الموضع {p}. أعلى من العلامة، فترتفع درجة.',
      es: 'El primer 1 está en la posición {p}. Más alto que la marca: sube un escalón.',
      fr: "Le premier 1 est en position {p}. Plus haut que le cran : il monte d'un cran.",
      hi: 'पहला 1 स्थान {p} पर है। निशान से ऊंचा — निशान एक पायदान ऊपर जाता है।',
      id: 'Angka 1 pertama ada di posisi {p}. Lebih tinggi dari takik — takik naik satu tingkat.',
      pt: 'O primeiro 1 está na posição {p}. Mais alto que a marca — ela sobe um degrau.',
    },
    'caption.stay': {
      en: 'The first 1 sits at {p}. The notch stays.',
      ko: '첫 1 의 자리는 {p}. 눈금은 그대로다.',
      ja: '最初の 1 の位置は {p}。目盛りは動かない。',
      zh: '第一个 1 在第 {p} 位。刻度不动。',
      ar: 'أول 1 في الموضع {p}. العلامة لا تتحرك.',
      es: 'El primer 1 está en la posición {p}. La marca no se mueve.',
      fr: 'Le premier 1 est en position {p}. Le cran ne bouge pas.',
      hi: 'पहला 1 स्थान {p} पर है। निशान वहीं रहता है।',
      id: 'Angka 1 pertama ada di posisi {p}. Takik tidak bergerak.',
      pt: 'O primeiro 1 está na posição {p}. A marca não se move.',
    },
    'caption.done': {
      en: 'Nothing was kept but the notch — distinct items, about {n}.',
      ko: '남긴 것은 눈금 하나 — 서로 다른 것은 대략 {n}.',
      ja: '残したのは目盛りひとつ — 異なるものはおよそ {n}。',
      zh: '只留下一个刻度 — 不同的元素大约有 {n}。',
      ar: 'لم يبق سوى العلامة — العناصر المختلفة نحو {n}.',
      es: 'Solo quedó la marca: elementos distintos, cerca de {n}.',
      fr: 'Il ne reste que le cran : éléments distincts, environ {n}.',
      hi: 'बस एक निशान बचा — अलग-अलग वस्तुएं लगभग {n}।',
      id: 'Yang tersisa hanya takik — item berbeda, sekitar {n}.',
      pt: 'Só ficou a marca: itens distintos, cerca de {n}.',
    },
  },
};
