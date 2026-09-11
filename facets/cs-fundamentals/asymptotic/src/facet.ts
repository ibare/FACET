/**
 * asymptotic — 같은 반이면 비가 머물고, 다른 반이면 비가 떠난다.
 *
 * 손잡이는 입력 크기 n 하나다. 밀면 같은 반(`2n²` 대 `n²`)의 비는 **2 에 붙박여**
 * 있는데 다른 반(`n²` 대 `n log₂n`)의 비는 2 → 4 → 10.7 → 32 → 102.4 로 떠난다.
 * **손잡이를 밀어도 안 움직이는 수가 주장**인 꼴이다.
 *
 * `initialData` 에는 **1차 데이터만** 둔다 — 세 함수의 모양과 n 사다리와 손잡이의
 * 처음 자리와 걸음 간격. 비도 낱개 수도 자릿값도 algorithm 이 직접 셈한다. 여기
 * 적어 두면 사다리를 바꿀 때 화면이 조용히 거짓을 말하게 된다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const asymptoticFacet: FacetJson = {
  id: 'facet:asymptotic',

  title: {
    en: 'Asymptotic analysis',
    ko: '점근 분석',
    ja: '漸近解析',
    zh: '渐近分析',
    ar: 'التحليل المقارب',
    es: 'Análisis asintótico',
    fr: 'Analyse asymptotique',
    hi: 'स्पर्शोन्मुख विश्लेषण',
    id: 'Analisis asimtotik',
    pt: 'Análise assintótica',
  },

  description: {
    en: 'Two functions in the same growth class keep a fixed ratio forever, while different classes drift apart without end — push the input size and watch which ratio stays at two.',
    ko: '같은 반의 두 함수는 비가 끝까지 상수로 머물고, 반이 다르면 비가 끝없이 벌어진다. 입력 크기를 밀어 어느 비가 2 에 붙박여 있는지 보라.',
    ja: '同じ階級の二つの関数は比が最後まで一定にとどまり、階級が違えば比は際限なく開いていく。入力の大きさを動かして、どちらの比が 2 のままかを見てほしい。',
    zh: '同一增长等级的两个函数，比值始终固定不变；等级不同，比值就会无止境地拉开。拨动输入规模，看看哪个比值一直停在 2。',
    ar: 'دالتان من الفئة نفسها تحافظان على نسبة ثابتة إلى ما لا نهاية، أما اختلاف الفئة فيباعد بينهما بلا حدّ — حرّك حجم المدخل وانظر أي النسبتين تبقى عند اثنين.',
    es: 'Dos funciones de la misma clase de crecimiento mantienen para siempre una razón fija, mientras que clases distintas se separan sin fin: mueve el tamaño de entrada y mira qué razón se queda en dos.',
    fr: "Deux fonctions de la même classe de croissance gardent un rapport fixe pour toujours, alors que des classes différentes s'écartent sans fin : déplacez la taille d'entrée et voyez quel rapport reste à deux.",
    hi: 'एक ही वृद्धि वर्ग के दो फलनों का अनुपात सदा स्थिर रहता है, जबकि अलग-अलग वर्गों के फलन बिना अंत के दूर होते जाते हैं — इनपुट का आकार बदलिए और देखिए कौन सा अनुपात दो पर ही टिका रहता है।',
    id: 'Dua fungsi dalam kelas pertumbuhan yang sama menjaga rasio tetap selamanya, sedangkan kelas yang berbeda merenggang tanpa henti — geser ukuran masukan dan lihat rasio mana yang bertahan di angka dua.',
    pt: 'Duas funções da mesma classe de crescimento mantêm para sempre uma razão fixa, enquanto classes diferentes se afastam sem fim — mova o tamanho da entrada e veja qual razão permanece em dois.',
  },

  algorithm: 'module:asymptotic',
  projector: 'module:asymptoticProjector',

  /**
   * 1차 데이터는 **모양**과 사다리뿐이다.
   *   nLogN          coefficient × n^exponent × log_logBase(n)  →  n log₂n
   *   nSquared       logBase 0 이라 로그 인자가 없다            →  n²
   *   twiceNSquared  nSquared 와 계수만 다르다                  →  2n²
   * 비(2 · 4 · 10.7 · 32 · 102.4)도 낱개 수도 여기 적지 않는다 — algorithm 이 셈한다.
   */
  initialData: {
    type: 'asymptotic',
    sizes: [4, 16, 64, 256, 1024],
    nLogN: { coefficient: 1, exponent: 1, logBase: 2 },
    nSquared: { coefficient: 1, exponent: 2, logBase: 0 },
    twiceNSquared: { coefficient: 2, exponent: 2, logBase: 0 },
    /**
     * 손잡이의 처음 자리. 사다리 끝에서 시작해 **갈라진 결과를 먼저 보이고**, 되돌려
     * 밀면 작은 쪽에서 둘이 구별되지 않는 자리에 닿는다.
     */
    size: 1024,
    /**
     * 걸음 사이에 쉬는 시간. stage 의 운동이 그 앞에 더해진다 — 가장 얇은 걸음
     * (크기 짚기)이 440ms 라 벽시계는 860ms 이고 **실측은 864ms** 였다. 800ms
     * 바닥선은 `S-piece` 85–87 을 완제품에 준용한 것이고, 실측은 테스트가 실제
     * stage 를 굴리며 잰다 (가장 얇은 걸음 864 · 가장 두꺼운 걸음 995ms).
     */
    stepMs: 420,
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
    stage: { type: 'asymptotic-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        ...CONTROL_SET.playback,
        {
          widget: 'segmented-slider',
          action: 'size',
          name: 'size',
          label: {
            en: 'Input size n',
            ko: '입력 크기 n',
            ja: '入力の大きさ n',
            zh: '输入规模 n',
            ar: 'حجم المدخل n',
            es: 'Tamaño de entrada n',
            fr: "Taille d'entrée n",
            hi: 'इनपुट आकार n',
            id: 'Ukuran masukan n',
            pt: 'Tamanho da entrada n',
          },
          segments: [
            { value: 4, label: '4' },
            { value: 16, label: '16' },
            { value: 64, label: '64' },
            { value: 256, label: '256' },
            // 값으로 읽는 수라 세 자리마다 끊는다 — 기록줄과 캡션의 같은 수와 맞춘다.
            { value: 1024, label: '1,024', default: true },
          ],
        },
      ],
      metrics: [
        {
          name: 'cross-tile-count',
          label: {
            en: 'Different',
            ko: '다른 반',
            ja: '違う階級',
            zh: '不同等级',
            ar: 'فئة مختلفة',
            es: 'Distinta',
            fr: 'Différente',
            hi: 'अलग',
            id: 'Berbeda',
            pt: 'Diferente',
          },
          initial: 0,
        },
        {
          name: 'same-tile-count',
          label: {
            en: 'Same',
            ko: '같은 반',
            ja: '同じ階級',
            zh: '相同等级',
            ar: 'الفئة نفسها',
            es: 'Misma',
            fr: 'Même',
            hi: 'वही',
            id: 'Sama',
            pt: 'Mesma',
          },
          initial: 0,
        },
        {
          name: 'log-bit-count',
          label: {
            en: 'Log factor',
            ko: '자릿값',
            ja: '対数因子',
            zh: '对数因子',
            ar: 'المعامل اللوغاريتمي',
            es: 'Factor log',
            fr: 'Facteur log',
            hi: 'लघुगणक गुणक',
            id: 'Faktor log',
            pt: 'Fator log',
          },
          initial: 0,
        },
      ],
    },
    codePanel: {
      type: 'code-view',
      ir: 'ir:asymptotic-imperative',
      label: {
        en: 'How many times it fits',
        ko: '몇 번 들어가는가',
        ja: '何回入るか',
        zh: '能装下多少次',
        ar: 'كم مرة تتسع',
        es: 'Cuántas veces cabe',
        fr: 'Combien de fois elle tient',
        hi: 'कितनी बार समाता है',
        id: 'Berapa kali muat',
        pt: 'Quantas vezes cabe',
      },
    },
  },

  messages: {
    /*
     * 두 반의 **이름**이다. 곁에 새겨지는 `n² ÷ n log₂n` · `2n² ÷ n²` 는 수식 표기라
     * 여기 없다 — 표식은 상수로 두고 키를 만들지 않는다 (C10 판정 3).
     */
    'label.crossClass': {
      en: 'Different class',
      ko: '다른 반',
      ja: '違う階級',
      zh: '不同等级',
      ar: 'فئة مختلفة',
      es: 'Clase distinta',
      fr: 'Classe différente',
      hi: 'अलग वर्ग',
      id: 'Kelas berbeda',
      pt: 'Classe diferente',
    },
    'label.sameClass': {
      en: 'Same class',
      ko: '같은 반',
      ja: '同じ階級',
      zh: '相同等级',
      ar: 'الفئة نفسها',
      es: 'Misma clase',
      fr: 'Même classe',
      hi: 'वही वर्ग',
      id: 'Kelas sama',
      pt: 'Mesma classe',
    },
    'label.record': {
      en: 'Every size walked so far',
      ko: '지나온 크기 전부',
      ja: 'ここまでに歩いた大きさ',
      zh: '走过的所有规模',
      ar: 'كل الأحجام التي مررنا بها',
      es: 'Todos los tamaños recorridos',
      fr: 'Toutes les tailles parcourues',
      hi: 'अब तक देखे गए सभी आकार',
      id: 'Semua ukuran yang sudah dilalui',
      pt: 'Todos os tamanhos percorridos',
    },

    'caption.board': {
      en: 'Each bar is the bigger function, cut into pieces of the smaller one. The count of pieces is the ratio.',
      ko: '자 하나가 큰 쪽이고, 그것을 작은 쪽의 낱개로 자른다. 낱개의 수가 곧 비다.',
      ja: '一本の物差しが大きい方で、それを小さい方の一枚分に切る。枚数がそのまま比になる。',
      zh: '每根尺是较大的那个函数，把它切成较小者的小块。小块的数目就是比值。',
      ar: 'كل شريط هو الدالة الأكبر، مقطّعًا إلى قطع من الأصغر. وعدد القطع هو النسبة.',
      es: 'Cada barra es la función mayor, cortada en piezas de la menor. El número de piezas es la razón.',
      fr: 'Chaque barre est la fonction la plus grande, découpée en pièces de la plus petite. Le nombre de pièces est le rapport.',
      hi: 'हर पट्टी बड़ा फलन है, जिसे छोटे के टुकड़ों में काटा गया है। टुकड़ों की संख्या ही अनुपात है।',
      id: 'Tiap batang adalah fungsi yang lebih besar, dipotong menjadi keping-keping fungsi yang lebih kecil. Jumlah keping itulah rasionya.',
      pt: 'Cada barra é a função maior, cortada em peças da menor. O número de peças é a razão.',
    },
    'caption.size': {
      en: 'Size {n} takes {bits} binary digits, and that is its log factor.',
      ko: '크기 {n} 은 이진수로 {bits} 자리다. 그 자릿수가 곧 로그 인자다.',
      ja: '大きさ {n} は二進法で {bits} 桁。その桁数がそのまま対数の因子になる。',
      zh: '规模 {n} 用二进制写有 {bits} 位，这个位数就是对数因子。',
      ar: 'الحجم {n} يحتاج {bits} خانة ثنائية، وهذا هو معامله اللوغاريتمي.',
      es: 'El tamaño {n} ocupa {bits} dígitos binarios, y ese es su factor logarítmico.',
      fr: "La taille {n} tient sur {bits} chiffres binaires, et c'est là son facteur logarithmique.",
      hi: 'आकार {n} को द्विआधारी में {bits} अंक चाहिए, और यही उसका लघुगणक गुणक है।',
      id: 'Ukuran {n} memerlukan {bits} digit biner, dan itulah faktor logaritmanya.',
      pt: 'O tamanho {n} ocupa {bits} dígitos binários, e esse é o seu fator logarítmico.',
    },
    'caption.cross': {
      en: 'At size {n} the bigger function holds {tiles} whole pieces of the smaller one.',
      ko: '크기 {n} 에서 큰 쪽은 작은 쪽을 온전히 {tiles} 개 담는다.',
      ja: '大きさ {n} では、大きい方が小さい方をまるごと {tiles} 枚ぶん収める。',
      zh: '在规模 {n} 上，较大者能完整装下 {tiles} 块较小者。',
      ar: 'عند الحجم {n} تسع الدالة الأكبر {tiles} قطعة كاملة من الأصغر.',
      es: 'En el tamaño {n} la función mayor contiene {tiles} piezas enteras de la menor.',
      fr: 'À la taille {n}, la fonction la plus grande contient {tiles} pièces entières de la plus petite.',
      hi: 'आकार {n} पर बड़ा फलन छोटे के {tiles} पूरे टुकड़े समेटता है।',
      id: 'Pada ukuran {n}, fungsi yang lebih besar memuat {tiles} keping utuh fungsi yang lebih kecil.',
      pt: 'No tamanho {n} a função maior comporta {tiles} peças inteiras da menor.',
    },
    'caption.same': {
      en: 'At size {n} it holds only {tiles}, and that count never changes.',
      ko: '크기 {n} 에서는 {tiles} 개뿐이고, 그 수는 끝까지 변하지 않는다.',
      ja: '大きさ {n} では {tiles} 枚だけで、その数は最後まで変わらない。',
      zh: '在规模 {n} 上只有 {tiles} 块，而这个数目始终不变。',
      ar: 'عند الحجم {n} لا تسع سوى {tiles}، وهذا العدد لا يتغيّر أبدًا.',
      es: 'En el tamaño {n} solo caben {tiles}, y esa cuenta no cambia nunca.',
      fr: "À la taille {n}, elle n'en contient que {tiles}, et ce nombre ne change jamais.",
      hi: 'आकार {n} पर केवल {tiles} समाते हैं, और यह संख्या कभी नहीं बदलती।',
      id: 'Pada ukuran {n} hanya memuat {tiles}, dan jumlah itu tak pernah berubah.',
      pt: 'No tamanho {n} cabem apenas {tiles}, e essa contagem nunca muda.',
    },
    'caption.verdictLevel': {
      en: 'At size {n} both pairs give {cross}. A single size cannot tell the two classes apart.',
      ko: '크기 {n} 에서는 두 짝이 똑같이 {cross} 다. 한 크기만으로는 두 반을 가를 수 없다.',
      ja: '大きさ {n} では二組とも {cross} で同じだ。一つの大きさだけでは階級を見分けられない。',
      zh: '在规模 {n} 上两组都是 {cross}。单看一个规模分不出两种等级。',
      ar: 'عند الحجم {n} يعطي الزوجان {cross} نفسه. حجم واحد لا يكفي للتمييز بين الفئتين.',
      es: 'En el tamaño {n} ambos pares dan {cross}. Un solo tamaño no distingue las dos clases.',
      fr: 'À la taille {n}, les deux paires donnent {cross}. Une seule taille ne distingue pas les deux classes.',
      hi: 'आकार {n} पर दोनों जोड़े {cross} ही देते हैं। एक ही आकार से दोनों वर्ग अलग नहीं किए जा सकते।',
      id: 'Pada ukuran {n} kedua pasangan sama-sama memberi {cross}. Satu ukuran saja tak bisa membedakan kedua kelas.',
      pt: 'No tamanho {n} os dois pares dão {cross}. Um único tamanho não distingue as duas classes.',
    },
    'caption.verdictSplit': {
      en: 'At size {n} the same class still gives {same}, while the other pair has reached {cross}.',
      ko: '크기 {n} 에서 같은 반은 여전히 {same} 인데, 다른 반은 {cross} 에 이르렀다.',
      ja: '大きさ {n} で同じ階級はなお {same} のまま、違う階級は {cross} に達した。',
      zh: '在规模 {n} 上，相同等级仍是 {same}，而另一组已经到了 {cross}。',
      ar: 'عند الحجم {n} لا تزال الفئة نفسها تعطي {same}، بينما بلغ الزوج الآخر {cross}.',
      es: 'En el tamaño {n} la misma clase sigue dando {same}, mientras que el otro par ha llegado a {cross}.',
      fr: "À la taille {n}, la même classe donne toujours {same}, tandis que l'autre paire atteint {cross}.",
      hi: 'आकार {n} पर वही वर्ग अब भी {same} देता है, जबकि दूसरी जोड़ी {cross} तक पहुँच चुकी है।',
      id: 'Pada ukuran {n} kelas yang sama tetap memberi {same}, sementara pasangan satunya sudah mencapai {cross}.',
      pt: 'No tamanho {n} a mesma classe ainda dá {same}, enquanto o outro par chegou a {cross}.',
    },
    'caption.waiting': {
      en: 'Move the input size and watch which ratio refuses to move.',
      ko: '입력 크기를 밀어, 어느 비가 꿈쩍도 하지 않는지 보라.',
      ja: '入力の大きさを動かして、どちらの比が動かないままかを見てほしい。',
      zh: '拨动输入规模，看看哪一个比值纹丝不动。',
      ar: 'حرّك حجم المدخل وانظر أي النسبتين ترفض أن تتحرك.',
      es: 'Mueve el tamaño de entrada y observa qué razón se niega a moverse.',
      fr: "Déplacez la taille d'entrée et voyez quel rapport refuse de bouger.",
      hi: 'इनपुट का आकार बदलिए और देखिए कौन सा अनुपात टस से मस नहीं होता।',
      id: 'Geser ukuran masukan dan lihat rasio mana yang sama sekali tak bergeser.',
      pt: 'Mova o tamanho da entrada e veja qual razão se recusa a mudar.',
    },
  },
};
