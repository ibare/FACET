/**
 * facet:primality — 소수 판정: √까지만 나눠 보면 되고, 그것이 얼마나 큰 아낌인가.
 *
 * 손잡이가 **판정할 수** 하나뿐인 완제품이다. 화면에 뜨는 문자는 전부 여기
 * `messages` 에 있고 코드에는 키만 남는다 (C10). 후보 수 · 검사 횟수 · 배율은
 * 선언에 두지 않는다 — algorithm 이 n 하나에서 직접 셈한다.
 *
 * ── 손잡이 다섯이 전부 소수인 것이 이 facet 의 설계다
 *
 * 합성수는 두 방법이 다 일찍 멈춰 아낌이 드러나지 않는다. 잇는 조각
 * (`facet:divisorPairsSqrt`) 이 36 에서 아낌을 한 글자도 말하지 않은 까닭이
 * 정확히 그것이다. 소수일 때만 둘 다 끝까지 가고, 그때 비로소 √ 의 값이 보인다.
 *
 * ── 합성수 갈래의 캡션이 없는 까닭
 *
 * 손잡이가 소수만 내주므로 그 갈래는 화면에 닿을 수 없다. 뜰 수 없는 문안을
 * 선언하면 코드에만 있는 죽은 문장이 된다. 그 갈래는 **코드 패널**이 진다 —
 * `irs.ts` 의 `return 0` 이고, 재생 내내 불이 들어오지 않는 것이 곧 소수라는
 * 뜻이다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const primalityFacet: FacetJson = {
  id: 'facet:primality',
  // 제목은 카탈로그 카드의 이름과 같다 (C4 명명 규칙 5).
  title: {
    en: 'Primality test',
    ko: '소수 판정',
    ja: '素数判定',
    zh: '素数判定',
    ar: 'اختبار الأولية',
    es: 'Prueba de primalidad',
    fr: 'Test de primalité',
    hi: 'अभाज्यता परीक्षण',
    id: 'Uji keprimaan',
    pt: 'Teste de primalidade',
  },
  description: {
    en: 'Dividing only up to the square root settles it — and on a prime you can finally see how much that saves.',
    ko: '제곱근까지만 나눠 봐도 판정이 끝난다. 그것이 얼마나 큰 아낌인지는 소수에서야 드러난다.',
    ja: '平方根までで判定は終わる。それがどれほどの節約かは素数でこそ見えてくる。',
    zh: '只除到平方根就能定下答案 — 而这能省下多少，只有在素数上才看得出来。',
    ar: 'القسمة حتى الجذر التربيعي وحدها تحسم الأمر، ومع عدد أولي يتضح أخيرًا حجم ما توفّره.',
    es: 'Dividir solo hasta la raíz cuadrada basta para decidirlo, y con un primo se ve por fin cuánto ahorra.',
    fr: 'Diviser jusqu’à la racine carrée suffit à trancher, et sur un nombre premier on voit enfin tout ce que cela épargne.',
    hi: 'वर्गमूल तक ही भाग देकर फैसला हो जाता है — और यह कितनी बचत है, यह अभाज्य संख्या पर ही दिखता है।',
    id: 'Membagi hanya sampai akar kuadrat sudah cukup memutuskan, dan pada bilangan prima barulah terlihat betapa besar penghematannya.',
    pt: 'Dividir só até a raiz quadrada já decide, e num número primo vê-se enfim o quanto isso economiza.',
  },
  algorithm: 'module:primality',
  projector: 'module:primalityProjector',
  initialData: {
    type: 'primality',
    /** 1차 데이터는 이 수 하나다. 후보도 √n 도 배율도 algorithm 이 셈한다. */
    n: 97,
    buildMs: 900,
    stepMs: 520,
  },
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      { ref: 'stage', padding: '8px 0' },
      { ref: 'controls' },
      { ref: 'codePanel' },
    ],
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'primality-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        ...CONTROL_SET.playback,
        {
          widget: 'segmented-slider',
          action: 'n',
          name: 'n',
          label: {
            en: 'Number tested',
            ko: '판정할 수',
            ja: '判定する数',
            zh: '判定的数',
            ar: 'العدد المختبَر',
            es: 'Número probado',
            fr: 'Nombre testé',
            hi: 'परखी गई संख्या',
            id: 'Bilangan yang diuji',
            pt: 'Número testado',
          },
          // 숫자 라벨은 열 언어로 쓰지 않는다 — 문자열 하나면 된다.
          segments: [
            { value: 97, label: '97', default: true },
            { value: 211, label: '211' },
            { value: 409, label: '409' },
            { value: 797, label: '797' },
            { value: 1597, label: '1597' },
          ],
        },
      ],
      metrics: [
        {
          name: 'check-count',
          label: {
            en: 'Checks',
            ko: '검사',
            ja: '検査',
            zh: '检查',
            ar: 'فحوص',
            es: 'Comprobaciones',
            fr: 'Vérifications',
            hi: 'जाँच',
            id: 'Pemeriksaan',
            pt: 'Verificações',
          },
          initial: 0,
        },
        {
          name: 'full-check-count',
          label: {
            en: 'If checked all',
            ko: '전부라면',
            ja: '全部なら',
            zh: '若全查',
            ar: 'لو فُحص الكل',
            es: 'Si todos',
            fr: 'Si tous',
            hi: 'सब जाँचें तो',
            id: 'Jika semua',
            pt: 'Se todos',
          },
          initial: 0,
        },
      ],
    },
    codePanel: {
      type: 'code-view',
      label: {
        en: 'Code',
        ko: '코드',
        ja: 'コード',
        zh: '代码',
        ar: 'الشيفرة',
        es: 'Código',
        fr: 'Code',
        hi: 'कोड',
        id: 'Kode',
        pt: 'Código',
      },
      ir: 'ir:primality-imperative',
    },
  },
  messages: {
    // ── stage 가 그리는 도식 라벨
    'label.candidates': {
      en: 'Candidate divisors',
      ko: '나눠 볼 후보',
      ja: '割ってみる候補',
      zh: '试除候选',
      ar: 'القواسم المرشحة',
      es: 'Divisores candidatos',
      fr: 'Diviseurs candidats',
      hi: 'उम्मीदवार भाजक',
      id: 'Calon pembagi',
      pt: 'Divisores candidatos',
    },
    'label.sqrtSide': {
      en: 'Up to the square root',
      ko: '제곱근까지',
      ja: '平方根まで',
      zh: '到平方根为止',
      ar: 'حتى الجذر التربيعي',
      es: 'Hasta la raíz cuadrada',
      fr: "Jusqu'à la racine carrée",
      hi: 'वर्गमूल तक',
      id: 'Sampai akar kuadrat',
      pt: 'Até a raiz quadrada',
    },
    'label.fullSide': {
      en: 'Every candidate below n',
      ko: 'n 아래 전부',
      ja: 'n 未満のすべて',
      zh: 'n 以下全部',
      ar: 'كل مرشح دون n',
      es: 'Todos los candidatos bajo n',
      fr: 'Tous les candidats sous n',
      hi: 'n से नीचे सभी',
      id: 'Semua calon di bawah n',
      pt: 'Todos os candidatos abaixo de n',
    },
    'label.ratio': {
      en: '{ratio}x fewer checks',
      ko: '{ratio} 배 적은 검사',
      ja: '検査が {ratio} 分の 1',
      zh: '检查少 {ratio} 倍',
      ar: 'فحوص أقل بـ {ratio} مرة',
      es: '{ratio}x menos comprobaciones',
      fr: '{ratio}x moins de vérifications',
      hi: '{ratio} गुना कम जाँच',
      id: 'Pemeriksaan {ratio}x lebih sedikit',
      pt: '{ratio}x menos verificações',
    },

    // ── projector 가 짓는 캡션
    'caption.built': {
      en: 'Is {n} prime? The candidates to divide by run from 2 up to {limit}.',
      // 수 뒤에 조사를 붙이지 않는다 — 409 는 "가", 97 은 "이" 라 데이터가
      // 바뀌면 문장이 틀어진다.
      ko: '소수인지 볼 수: {n}. 나눠 볼 후보는 2 부터 {limit} 까지.',
      ja: '{n} は素数か。割ってみる候補は 2 から {limit} まで。',
      zh: '{n} 是素数吗？要试除的候选从 2 到 {limit}。',
      ar: 'هل {n} عدد أولي؟ القواسم المرشحة تمتد من 2 حتى {limit}.',
      es: '¿Es {n} primo? Los candidatos por los que dividir van de 2 a {limit}.',
      fr: '{n} est-il premier ? Les candidats diviseurs vont de 2 à {limit}.',
      hi: 'क्या {n} अभाज्य है? भाग देने के लिए उम्मीदवार 2 से {limit} तक हैं।',
      id: 'Apakah {n} bilangan prima? Calon pembagi membentang dari 2 sampai {limit}.',
      pt: '{n} é primo? Os candidatos a divisor vão de 2 até {limit}.',
    },
    'caption.check': {
      en: '{n} divided by {d} leaves a remainder — not a divisor.',
      ko: '나머지가 남는다. 나눈 수: {d}. 나뉜 수: {n}.',
      ja: '割り切れない。割った数: {d}。割られた数: {n}。',
      zh: '除不尽。除数为 {d}，被除数为 {n}。',
      ar: 'القسمة تترك باقيًا. المقسوم عليه {d}، والمقسوم {n}.',
      es: '{n} dividido por {d} deja resto: no es divisor.',
      fr: '{n} divisé par {d} laisse un reste : ce n’est pas un diviseur.',
      hi: '{n} में {d} का भाग देने पर शेष बचता है — यह भाजक नहीं है।',
      id: '{n} dibagi {d} bersisa — bukan pembagi.',
      pt: '{n} dividido por {d} deixa resto: não é divisor.',
    },
    'caption.wall': {
      en: 'The candidates stop at {limit}. Past the square root nothing new can turn up, because the smaller side of every divisor pair sits at or before it.',
      ko: '후보는 {limit} 에서 끝난다. 제곱근 너머에서는 새로 나올 것이 없다 — 약수 짝의 작은 쪽은 언제나 그 앞에 있기 때문이다.',
      ja: '候補は {limit} で終わる。平方根の先に新しく出てくるものはない — 約数の対の小さい側は必ずその手前にあるからだ。',
      zh: '候选到 {limit} 为止。平方根之外不会再冒出新的东西，因为每一对约数中较小的那个都在它之前。',
      ar: 'تنتهي القواسم المرشحة عند {limit}. لا يظهر شيء جديد بعد الجذر التربيعي، لأن الطرف الأصغر في كل زوج قواسم يقع عنده أو قبله.',
      es: 'Los candidatos acaban en {limit}. Más allá de la raíz cuadrada no aparece nada nuevo, porque el menor de cada par de divisores está en ella o antes.',
      fr: 'Les candidats s’arrêtent à {limit}. Au-delà de la racine carrée rien de nouveau ne peut surgir, car le plus petit de chaque paire de diviseurs se trouve avant elle ou sur elle.',
      hi: 'उम्मीदवार {limit} पर समाप्त हो जाते हैं। वर्गमूल के आगे कुछ नया नहीं निकल सकता, क्योंकि हर भाजक-जोड़े का छोटा भाजक उससे पहले या उसी पर होता है।',
      id: 'Calon berhenti di {limit}. Melewati akar kuadrat tidak ada yang baru muncul, sebab sisi yang lebih kecil dari setiap pasangan pembagi berada di sana atau sebelumnya.',
      pt: 'Os candidatos terminam em {limit}. Além da raiz quadrada nada de novo pode surgir, pois o menor de cada par de divisores está nela ou antes.',
    },
    'caption.verdict': {
      en: '{n} is prime, settled in {checks} checks. Dividing by every candidate below {n} would have taken {full}.',
      // 수 뒤에 조사를 붙이지 않는다 — 409 는 "는", 97 은 "은" 이라 데이터가
      // 바뀌면 문장이 틀어진다. 그래서 {n} 을 콜론 뒤로 민다.
      ko: '소수다. 판정한 수: {n}. 한 검사는 {checks}. 낱낱이 다 나눠 봤다면 {full}.',
      ja: '素数だ。判定した数: {n}。行った検査は {checks}。すべて割ってみていたら {full}。',
      zh: '是素数。判定的数为 {n}。做的检查为 {checks}。若逐一试除，则需要 {full}。',
      ar: 'إنه عدد أولي، وحُسم بعد {checks} فحصًا. ولو قسمنا على كل مرشح دون {n} لاحتجنا {full}.',
      es: '{n} es primo, resuelto en {checks} comprobaciones. Dividir por cada candidato habría costado {full}.',
      fr: '{n} est premier, réglé en {checks} vérifications. Diviser par chaque candidat en aurait demandé {full}.',
      hi: '{n} अभाज्य है, {checks} जाँचों में तय हो गया। हर उम्मीदवार से भाग देने पर {full} जाँचें लगतीं।',
      id: '{n} adalah bilangan prima, selesai dalam {checks} pemeriksaan. Membagi dengan setiap calon akan memakan {full}.',
      pt: '{n} é primo, resolvido em {checks} verificações. Dividir por cada candidato teria custado {full}.',
    },
  },
};
