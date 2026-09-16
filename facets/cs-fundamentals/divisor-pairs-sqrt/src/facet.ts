/**
 * 약수의 짝 — 왜 제곱근까지만 보면 충분한가.
 *
 * @piece 질문 하나에 답한다. 약수는 반드시 짝을 이루고, 짝의 작은 쪽은 언제나
 * √n 이하다. 그러니 √n 까지만 훑으면 모든 짝을 한 번씩 만난다.
 *
 * n = 36 을 쓰는 까닭은 √36 이 정수라 **접는 자리가 칸 경계가 아니라 칸 위**에
 * 오기 때문이다. 그 칸은 자기 자신과 짝을 이루고(6, 6), 날아올 거리가 0 이 된다.
 *
 * 이 조각은 **아낌을 말하지 않는다.** 몇 번 덜 보는가는 완제품 `primality` 의
 * 몫이고, 36 처럼 2 에서 바로 걸리는 수에서는 드러나지도 않는다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const divisorPairsSqrtFacet: FacetJson = {
  id: 'facet:divisorPairsSqrt',
  title: {
    en: 'Divisor pairs',
    ko: '약수의 짝',
    ja: '約数のペア',
    zh: '约数成对',
    ar: 'أزواج القواسم',
    es: 'Pares de divisores',
    fr: 'Paires de diviseurs',
    hi: 'भाजकों के जोड़े',
    id: 'Pasangan pembagi',
    pt: 'Pares de divisores',
  },
  description: {
    en: 'Divisors come in pairs, and the smaller side of every pair is at or below the square root.',
    ko: '약수는 짝을 이루고, 짝의 작은 쪽은 언제나 제곱근 이하에 있다.',
    ja: '約数は必ず対になり、対の小さい側は常に平方根以下にある。',
    zh: '约数总是成对出现，每一对中较小的那个都不超过平方根。',
    ar: 'تأتي القواسم في أزواج، والطرف الأصغر في كل زوج لا يتجاوز الجذر التربيعي.',
    es: 'Los divisores vienen en pares, y el menor de cada par nunca supera la raíz cuadrada.',
    fr: 'Les diviseurs vont par paires, et le plus petit de chaque paire ne dépasse jamais la racine carrée.',
    hi: 'भाजक हमेशा जोड़ों में आते हैं, और हर जोड़े का छोटा भाजक वर्गमूल से अधिक नहीं होता।',
    id: 'Pembagi selalu berpasangan, dan sisi yang lebih kecil dari setiap pasangan tidak melebihi akar kuadrat.',
    pt: 'Os divisores vêm em pares, e o menor de cada par nunca ultrapassa a raiz quadrada.',
  },
  algorithm: 'module:divisorPairsSqrt',
  scene: 'module:divisorPairsSqrtScene',
  initialData: {
    type: 'divisor-pairs-sqrt',
    /** 1차 데이터는 이 수 하나다. 약수도 짝도 √n 도 알고리즘이 셈한다. */
    n: 36,
    stepMs: 720,
  },
  blocks: {
    stage: { type: 'divisor-pairs-sqrt-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
  messages: {
    'caption.probe': {
      en: 'Is {d} a divisor of {n}?',
      ko: '지금 짚는 수: {d}. 나눌 대상: {n}.',
      ja: '{d} は {n} の約数か。',
      zh: '{d} 是 {n} 的约数吗？',
      ar: 'هل {d} قاسم للعدد {n}؟',
      es: '¿Es {d} un divisor de {n}?',
      fr: '{d} est-il un diviseur de {n} ?',
      hi: 'क्या {d} संख्या {n} का भाजक है?',
      id: 'Apakah {d} merupakan pembagi dari {n}?',
      pt: '{d} é um divisor de {n}?',
    },
    'caption.pair': {
      en: '{d} × {q} = {n}. Finding the smaller side finds the larger one too.',
      ko: '{d} × {q} = {n}. 작은 쪽을 찾으면 큰 쪽도 함께 찾은 것이다.',
      ja: '{d} × {q} = {n}。小さい側を見つければ大きい側も同時に見つかる。',
      zh: '{d} × {q} = {n}。找到较小的一个，也就找到了较大的一个。',
      ar: '{d} × {q} = {n}. إيجاد الطرف الأصغر يعني إيجاد الطرف الأكبر معه.',
      es: '{d} × {q} = {n}. Hallar el menor es hallar también el mayor.',
      fr: "{d} × {q} = {n}. Trouver le plus petit, c'est trouver aussi le plus grand.",
      hi: '{d} × {q} = {n}। छोटा भाजक मिलते ही बड़ा भाजक भी मिल जाता है।',
      id: '{d} × {q} = {n}. Menemukan sisi yang lebih kecil berarti menemukan yang lebih besar juga.',
      pt: '{d} × {q} = {n}. Encontrar o menor é encontrar também o maior.',
    },
    'caption.miss': {
      en: '{n} is not divisible by {d}. No partner here.',
      ko: '나누어떨어지지 않는다. 짝이 없는 수: {d}. 나눌 대상: {n}.',
      ja: '{n} は {d} で割り切れない。ここには対がない。',
      zh: '{n} 不能被 {d} 整除，这里没有成对的约数。',
      ar: 'العدد {n} لا يقبل القسمة على {d}. لا يوجد زوج هنا.',
      es: '{n} no es divisible por {d}. Aquí no hay pareja.',
      fr: "{n} n'est pas divisible par {d}. Pas de paire ici.",
      hi: '{n} संख्या {d} से विभाज्य नहीं है। यहाँ कोई जोड़ा नहीं।',
      id: '{n} tidak habis dibagi {d}. Tidak ada pasangan di sini.',
      pt: '{n} não é divisível por {d}. Aqui não há par.',
    },
    'caption.self': {
      en: '{d} × {d} = {n}. Here the pair meets itself — this is the square root of {n}.',
      ko: '{d} × {d} = {n}. 짝이 자기 자신과 만나는 자리, 곧 √{n}.',
      ja: '{d} × {d} = {n}。対が自分自身と出会う場所、それが √{n}。',
      zh: '{d} × {d} = {n}。这里一对约数与自身相遇，这就是 √{n}。',
      ar: '{d} × {d} = {n}. هنا يلتقي الزوج بنفسه، وهذا هو الجذر التربيعي للعدد {n}.',
      es: '{d} × {d} = {n}. Aquí el par se encuentra consigo mismo: esto es √{n}.',
      fr: "{d} × {d} = {n}. Ici la paire se rencontre elle-même : c'est √{n}.",
      hi: '{d} × {d} = {n}। यहाँ जोड़ा स्वयं से मिलता है — यही √{n} है।',
      id: '{d} × {d} = {n}. Di sini pasangan bertemu dirinya sendiri — inilah √{n}.',
      pt: '{d} × {d} = {n}. Aqui o par encontra a si mesmo — isto é √{n}.',
    },
    'caption.stop': {
      en: 'Every pair has its smaller side at or before the square root. Walking that far meets them all.',
      ko: '짝의 작은 쪽은 언제나 제곱근 이하에 있다. 거기까지만 훑으면 모든 짝을 만난다.',
      ja: '対の小さい側は必ず平方根以下にある。そこまで歩けばすべての対に出会う。',
      zh: '每一对中较小的那个都不超过平方根。走到那里就能遇见所有的对。',
      ar: 'الطرف الأصغر في كل زوج يقع عند الجذر التربيعي أو قبله. الوصول إلى هناك يكفي للقاء كل الأزواج.',
      es: 'El menor de cada par está en la raíz cuadrada o antes. Llegar hasta allí basta para encontrarlos todos.',
      fr: 'Le plus petit de chaque paire se trouve à la racine carrée ou avant. Aller jusque-là suffit pour les rencontrer toutes.',
      hi: 'हर जोड़े का छोटा भाजक वर्गमूल पर या उससे पहले होता है। वहाँ तक चलने पर सभी जोड़े मिल जाते हैं।',
      id: 'Sisi yang lebih kecil dari setiap pasangan berada di akar kuadrat atau sebelumnya. Berjalan sejauh itu sudah menemui semuanya.',
      pt: 'O menor de cada par está na raiz quadrada ou antes. Ir até lá basta para encontrar todos.',
    },
  },
};
