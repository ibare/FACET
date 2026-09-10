/**
 * @piece 견줌과 맞바꿈이 다른 동작임을 말하는 조각.
 *
 * 답하는 질문 하나: **정렬이 값을 옮기는 일이라면, 옮김은 언제 일어나는가.**
 * 짝 셋을 차례로 견주는데 실제로 자리를 바꾸는 것은 하나뿐이다. 견줌은 판정이고,
 * 맞바꿈은 그 판정이 참일 때만 뒤따르는 결과다.
 *
 * header 도 metrics 도 layout 도 두지 않는다 — 제목은 글의 문단이 주고, 셀 것은
 * 없으며, 배치는 stage 와 controls 뿐이라 러너가 만든다 (S-piece).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const compareAndSwapFacet: FacetJson = {
  id: 'facet:compareAndSwap',
  title: {
    en: 'Compare and swap',
    ko: '비교와 교환',
    ja: '比較と交換',
    zh: '比较与交换',
    ar: 'المقارنة والتبديل',
    es: 'Comparar e intercambiar',
    fr: 'Comparer et échanger',
    hi: 'तुलना और अदला-बदली',
    id: 'Bandingkan dan tukar',
    pt: 'Comparar e trocar',
  },
  description: {
    en: 'Comparing is a judgment. Swapping is what follows only when that judgment is true.',
    ko: '견줌은 판정이고, 맞바꿈은 그 판정이 참일 때만 뒤따르는 결과다.',
    ja: '比較は判定であり、交換はその判定が真のときだけ続く結果だ。',
    zh: '比较是判断，交换只是判断为真时才随之发生的结果。',
    ar: 'المقارنة حكم، والتبديل ما يتبعه فقط حين يكون ذلك الحكم صحيحًا.',
    es: 'Comparar es un juicio. Intercambiar es lo que sigue solo cuando ese juicio es cierto.',
    fr: "Comparer, c'est juger. Échanger ne suit que si ce jugement est vrai.",
    hi: 'तुलना एक निर्णय है। अदला-बदली तभी होती है जब वह निर्णय सही निकले।',
    id: 'Membandingkan adalah penilaian. Menukar hanya menyusul bila penilaian itu benar.',
    pt: 'Comparar é um juízo. Trocar só acontece quando esse juízo é verdadeiro.',
  },
  algorithm: 'module:compareAndSwap',
  projector: 'module:compareAndSwapProjector',
  initialData: {
    type: 'compare-and-swap',
    // 첫 짝만 어긋나 있고, 둘째는 이미 순서가 맞고, 셋째는 두 값이 같다.
    pairs: [
      [5, 3],
      [2, 7],
      [6, 6],
    ],
    stepMs: 800,
  },
  blocks: {
    stage: { type: 'compare-and-swap-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
  messages: {
    'caption.compare': {
      en: 'Comparing {left} and {right} — the test itself moves nothing.',
      ko: '두 값을 견준다 — {left}, {right}. 견줌 자체는 아무것도 옮기지 않는다.',
      ja: '{left} と {right} を見くらべる。比較そのものは何も動かさない。',
      zh: '比较 {left} 和 {right} — 比较本身不搬动任何东西。',
      ar: 'نقارن {left} و{right} — الاختبار نفسه لا يحرّك شيئًا.',
      es: 'Comparamos {left} y {right}: la prueba en sí no mueve nada.',
      fr: 'On compare {left} et {right} — le test lui-même ne déplace rien.',
      hi: '{left} और {right} की तुलना — जाँच अपने आप में कुछ नहीं हिलाती।',
      id: 'Membandingkan {left} dan {right} — ujinya sendiri tidak memindahkan apa pun.',
      pt: 'Comparamos {left} e {right} — o teste em si não move nada.',
    },
    'caption.swap': {
      en: "Out of order, so the two values cross into each other's seats.",
      ko: '어긋나 있으므로 두 값이 서로의 자리로 건너간다.',
      ja: '順序が逆なので、二つの値がたがいの席へ移る。',
      zh: '顺序不对，于是两个值互换座位。',
      ar: 'الترتيب مختل، فينتقل كل من القيمتين إلى مقعد الأخرى.',
      es: 'Están desordenados, así que los dos valores cruzan a sus asientos.',
      fr: "L'ordre est faux : les deux valeurs échangent leurs places.",
      hi: 'क्रम उलटा है, इसलिए दोनों मान एक-दूसरे की जगह पर चले जाते हैं।',
      id: 'Urutannya keliru, jadi kedua nilai berpindah ke kursi satu sama lain.',
      pt: 'Estão fora de ordem, então os dois valores trocam de lugar.',
    },
    'caption.holdOrdered': {
      en: 'Already in order — the comparison ends there and nothing moves.',
      ko: '이미 순서가 맞다 — 견줌은 여기서 끝나고 아무것도 움직이지 않는다.',
      ja: 'すでに順序どおり。比較はそこで終わり、何も動かない。',
      zh: '本来就是有序的 — 比较到此为止，什么都不动。',
      ar: 'الترتيب صحيح أصلًا — تنتهي المقارنة هنا ولا يتحرك شيء.',
      es: 'Ya están en orden: la comparación acaba ahí y nada se mueve.',
      fr: "Déjà dans l'ordre — la comparaison s'arrête là et rien ne bouge.",
      hi: 'पहले से क्रम में हैं — तुलना यहीं ख़त्म, कुछ नहीं हिलता।',
      id: 'Sudah urut — perbandingan berhenti di situ dan tidak ada yang bergerak.',
      pt: 'Já estão em ordem — a comparação termina aí e nada se move.',
    },
    'caption.holdEqual': {
      en: 'The two are equal — there is nothing to put in order.',
      ko: '두 값이 같다 — 자리를 맞출 것이 없다.',
      ja: '二つは等しい。並べ直すものが何もない。',
      zh: '两个值相等 — 没有什么要排的。',
      ar: 'القيمتان متساويتان — لا شيء يحتاج إلى ترتيب.',
      es: 'Los dos son iguales: no hay nada que ordenar.',
      fr: "Les deux sont égales — il n'y a rien à ordonner.",
      hi: 'दोनों बराबर हैं — क्रम में लगाने को कुछ नहीं।',
      id: 'Keduanya sama — tidak ada yang perlu diurutkan.',
      pt: 'Os dois são iguais — não há nada para ordenar.',
    },
    'caption.summary': {
      en: '{compares} comparisons, and only {swaps} of them moved anything.',
      ko: '견줌 {compares} 번, 그중 무언가를 옮긴 것은 {swaps} 번뿐이다.',
      ja: '比較は {compares} 回、そのうち何かを動かしたのは {swaps} 回だけだ。',
      zh: '比较 {compares} 次，其中真正搬动了东西的只有 {swaps} 次。',
      ar: '{compares} مقارنات، ولم يحرّك منها شيئًا سوى {swaps}.',
      es: '{compares} comparaciones, y solo {swaps} de ellas movieron algo.',
      fr: '{compares} comparaisons, dont {swaps} seulement ont déplacé quelque chose.',
      hi: '{compares} तुलनाएँ, और उनमें से केवल {swaps} ने कुछ हिलाया।',
      id: '{compares} perbandingan, dan hanya {swaps} yang benar-benar memindahkan sesuatu.',
      pt: '{compares} comparações, e só {swaps} delas moveram alguma coisa.',
    },
  },
};
