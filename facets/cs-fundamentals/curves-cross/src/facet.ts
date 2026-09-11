/**
 * @piece 점근 교차 — 작은 입력에서 이기던 쪽이 어느 자리에서 뒤집힌다.
 *
 * 답하는 질문 하나: **작은 입력에서 이기던 쪽이 어디서 뒤집히는가.** 삽입 정렬의
 * 비용 `n²/4` 와 병합 정렬의 비용 `n log₂n` 을 한 저울에 올려, n 이 자라는 동안
 * 저울이 한쪽으로 기울었다가 수평이 되고 반대로 넘어가는 것을 보인다. 그 자리가
 * 실무의 문턱이다 — 실제 정렬 라이브러리가 짧은 구간을 삽입 정렬에 맡기는 까닭.
 *
 * **1차 데이터는 두 비용 식의 모양과 n 사다리뿐이다.** 값은 알고리즘이 그 자리에서
 * 셈한다 (`test/curves-cross.test.ts` 가 다시 셈해 대조한다).
 *
 * 조각이므로 header 도 metrics 도 두지 않는다 (S-piece). 제목은 글의 문단이 주고,
 * 셀 것은 없다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const curvesCrossFacet: FacetJson = {
  id: 'facet:curvesCross',
  title: {
    en: 'Where the curves cross',
    ko: '곡선이 갈리는 자리',
    ja: '曲線が交わるところ',
    zh: '曲线交叉之处',
    ar: 'حيث يتقاطع المنحنيان',
    es: 'Donde las curvas se cruzan',
    fr: 'Là où les courbes se croisent',
    hi: 'जहाँ वक्र एक-दूसरे को काटते हैं',
    id: 'Tempat kedua kurva berpotongan',
    pt: 'Onde as curvas se cruzam',
  },
  description: {
    en: 'The slower algorithm really is faster while the input stays small — until one exact size flips the lead.',
    ko: '입력이 작을 동안에는 느린 알고리즘이 실제로 더 빠르다 — 어느 크기 하나에서 앞뒤가 뒤집힐 때까지.',
    ja: '入力が小さいうちは遅いはずのアルゴリズムが実際に速い — ある大きさで前後が入れ替わるまで。',
    zh: '只要输入还小，较慢的算法确实更快 — 直到某个大小让领先者互换。',
    ar: 'ما دام المدخل صغيرًا فإن الخوارزمية الأبطأ أسرع فعلًا — حتى يقلب حجم بعينه الترتيب.',
    es: 'Mientras la entrada sea pequeña, el algoritmo lento es de verdad el más rápido, hasta que un tamaño exacto invierte la ventaja.',
    fr: "Tant que l'entrée reste petite, l'algorithme le plus lent est vraiment le plus rapide — jusqu'à la taille exacte qui inverse l'avantage.",
    hi: 'जब तक इनपुट छोटा है, धीमा एल्गोरिद्म सचमुच तेज़ रहता है — जब तक एक निश्चित आकार बढ़त को पलट नहीं देता।',
    id: 'Selama masukannya kecil, algoritme yang lebih lambat justru lebih cepat — sampai satu ukuran tertentu membalik keunggulan.',
    pt: 'Enquanto a entrada é pequena, o algoritmo mais lento é de fato o mais rápido — até que um tamanho exato inverte a vantagem.',
  },
  algorithm: 'module:curvesCross',
  projector: 'module:curvesCrossProjector',

  /**
   * 1차 데이터는 **모양**뿐이다.
   *   insertion  n^exponent / divisor   →  n²/4
   *   merge      n × log_logBase(n)     →  n log₂n
   * 표에 적힌 수(1·2·4·8 …)를 여기 옮겨 적지 않는다 — 알고리즘이 셈한다.
   */
  initialData: {
    type: 'curves-cross',
    sizes: [2, 4, 8, 12, 16, 20, 32, 64],
    insertion: { exponent: 2, divisor: 4 },
    merge: { logBase: 2 },
    stepMs: 800,
  },

  blocks: {
    stage: { type: 'curves-cross-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },

  messages: {
    /*
     * 두 정렬의 **이름**이다. 곁에 붙는 `n²/4` · `n log₂n` 은 수식 표기라 여기
     * 없다 — 표식은 상수로 두고 키를 만들지 않는다 (C10 판정 3). 열 언어로 옮겨
     * 적어도 뜻이 갈리지 않는 것을 messages 에 넣으면 번역이 아니라 우회가 된다.
     */
    'label.insertion': {
      en: 'Insertion sort',
      ko: '삽입 정렬',
      ja: '挿入ソート',
      zh: '插入排序',
      ar: 'الترتيب بالإدراج',
      es: 'Ordenación por inserción',
      fr: 'Tri par insertion',
      hi: 'इंसर्शन सॉर्ट',
      id: 'Pengurutan sisip',
      pt: 'Ordenação por inserção',
    },
    'label.merge': {
      en: 'Merge sort',
      ko: '병합 정렬',
      ja: 'マージソート',
      zh: '归并排序',
      ar: 'الترتيب بالدمج',
      es: 'Ordenación por mezcla',
      fr: 'Tri fusion',
      hi: 'मर्ज सॉर्ट',
      id: 'Pengurutan gabung',
      pt: 'Ordenação por mistura',
    },
    /*
     * 괄호 아래 들어가는 짧은 문구다. 왼쪽 구간의 폭(335px)이 상한이라 문장이
     * 아니라 꼬리표로 쓴다 — 완전한 문장은 `caption.rule` 이 말한다.
     */
    'label.library': {
      en: 'libraries sort short runs here',
      ko: '라이브러리가 짧은 구간을 맡기는 자리',
      ja: 'ライブラリが短い区間を任せる範囲',
      zh: '排序库在此处理短区间',
      ar: 'هنا ترتّب المكتبات المقاطع القصيرة',
      es: 'aquí las bibliotecas ordenan tramos cortos',
      fr: 'ici les bibliothèques trient les courts segments',
      hi: 'यहाँ लाइब्रेरी छोटे हिस्से सँभालती हैं',
      id: 'di sini pustaka mengurutkan potongan pendek',
      pt: 'aqui as bibliotecas ordenam trechos curtos',
    },
    'caption.board': {
      en: 'Two sorts on one balance — the pan doing more work hangs lower.',
      ko: '두 정렬을 한 저울에 올린다 — 일이 많은 쪽이 무거워 내려앉는다.',
      ja: '二つのソートを一つの天秤に載せる — 仕事が多い側が重くて下がる。',
      zh: '把两种排序放上同一台天平 — 做得多的一侧更重，会沉下去。',
      ar: 'خوارزميتان على ميزان واحد — الكفة التي تعمل أكثر تهبط أخفض.',
      es: 'Dos ordenaciones en una misma balanza: el platillo que trabaja más queda más abajo.',
      fr: "Deux tris sur une même balance : le plateau qui travaille le plus descend.",
      hi: 'दो सॉर्ट एक ही तराज़ू पर — जो पलड़ा ज़्यादा काम करता है वह नीचे झुकता है।',
      id: 'Dua pengurutan pada satu neraca — piring yang bekerja lebih banyak turun lebih rendah.',
      pt: 'Duas ordenações na mesma balança: o prato que trabalha mais desce.',
    },
    'caption.insertionCheaper': {
      en: 'n = {n}: insertion {a}, merge {b}. The cheaper one is insertion.',
      ko: 'n = {n}: 삽입 {a}, 병합 {b} — 더 싼 쪽은 삽입.',
      ja: 'n = {n}: 挿入 {a}、マージ {b} — 安いのは挿入。',
      zh: 'n = {n}: 插入 {a}，归并 {b} — 更便宜的是插入。',
      ar: 'n = {n}: الإدراج {a}، الدمج {b}. الأرخص هو الإدراج.',
      es: 'n = {n}: inserción {a}, mezcla {b}. La más barata es la inserción.',
      fr: 'n = {n} : insertion {a}, fusion {b}. Le moins cher est le tri par insertion.',
      hi: 'n = {n}: इंसर्शन {a}, मर्ज {b} — सस्ता इंसर्शन है।',
      id: 'n = {n}: sisip {a}, gabung {b}. Yang lebih murah adalah sisip.',
      pt: 'n = {n}: inserção {a}, mistura {b}. O mais barato é a inserção.',
    },
    'caption.tie': {
      en: 'n = {n}: both sides weigh {a}. The beam is level.',
      ko: 'n = {n}: 양쪽 모두 {a} — 저울이 수평이다.',
      ja: 'n = {n}: どちらも {a} — 天秤が水平になる。',
      zh: 'n = {n}: 两侧都是 {a} — 横梁持平。',
      ar: 'n = {n}: الكفتان تزنان {a}. العارضة مستوية.',
      es: 'n = {n}: ambos lados pesan {a}. El fiel queda horizontal.',
      fr: 'n = {n} : les deux plateaux pèsent {a}. Le fléau est à l\'horizontale.',
      hi: 'n = {n}: दोनों ओर {a} — डंडी बिलकुल सीधी है।',
      id: 'n = {n}: kedua sisi sama-sama {a}. Palang neraca mendatar.',
      pt: 'n = {n}: os dois lados pesam {a}. O braço fica na horizontal.',
    },
    'caption.mergeCheaper': {
      en: 'n = {n}: insertion {a}, merge {b}. The cheaper one is merge.',
      ko: 'n = {n}: 삽입 {a}, 병합 {b} — 더 싼 쪽은 병합.',
      ja: 'n = {n}: 挿入 {a}、マージ {b} — 安いのはマージ。',
      zh: 'n = {n}: 插入 {a}，归并 {b} — 更便宜的是归并。',
      ar: 'n = {n}: الإدراج {a}، الدمج {b}. الأرخص هو الدمج.',
      es: 'n = {n}: inserción {a}, mezcla {b}. La más barata es la mezcla.',
      fr: 'n = {n} : insertion {a}, fusion {b}. Le moins cher est le tri fusion.',
      hi: 'n = {n}: इंसर्शन {a}, मर्ज {b} — सस्ता मर्ज है।',
      id: 'n = {n}: sisip {a}, gabung {b}. Yang lebih murah adalah gabung.',
      pt: 'n = {n}: inserção {a}, mistura {b}. O mais barato é a mistura.',
    },
    'caption.threshold': {
      en: 'The lead flips at exactly n = {n}: insertion owns the left, merge owns the right.',
      ko: '앞뒤가 뒤집히는 자리는 정확히 n = {n}. 왼쪽은 삽입의 몫이고 오른쪽은 병합의 몫이다.',
      ja: '前後が入れ替わるのはちょうど n = {n}。左は挿入のもの、右はマージのもの。',
      zh: '领先互换正好发生在 n = {n}：左边归插入，右边归归并。',
      ar: 'ينقلب التقدّم عند n = {n} بالضبط: اليسار للإدراج واليمين للدمج.',
      es: 'La ventaja se invierte justo en n = {n}: la izquierda es de la inserción y la derecha de la mezcla.',
      fr: "L'avantage s'inverse exactement à n = {n} : la gauche revient à l'insertion, la droite à la fusion.",
      hi: 'बढ़त ठीक n = {n} पर पलटती है: बायाँ हिस्सा इंसर्शन का, दायाँ मर्ज का।',
      id: 'Keunggulan berbalik tepat di n = {n}: sisi kiri milik sisip, sisi kanan milik gabung.',
      pt: 'A vantagem se inverte exatamente em n = {n}: a esquerda é da inserção e a direita é da mistura.',
    },
    'caption.rule': {
      en: 'This is why real sort libraries hand short runs to insertion sort.',
      ko: '실제 정렬 라이브러리가 짧은 구간을 삽입 정렬에 넘기는 까닭이 이것이다.',
      ja: '実際のソートライブラリが短い区間を挿入ソートに任せる理由がこれだ。',
      zh: '这就是真实的排序库把短区间交给插入排序的原因。',
      ar: 'لهذا تُسند مكتبات الترتيب الحقيقية المقاطع القصيرة إلى الترتيب بالإدراج.',
      es: 'Por eso las bibliotecas de ordenación reales entregan los tramos cortos a la inserción.',
      fr: "C'est pourquoi les vraies bibliothèques de tri confient les courts segments au tri par insertion.",
      hi: 'इसीलिए असली सॉर्ट लाइब्रेरी छोटे हिस्सों को इंसर्शन सॉर्ट को सौंप देती हैं।',
      id: 'Inilah sebabnya pustaka pengurutan nyata menyerahkan potongan pendek ke pengurutan sisip.',
      pt: 'É por isso que as bibliotecas de ordenação reais entregam trechos curtos à inserção.',
    },
  },
};
