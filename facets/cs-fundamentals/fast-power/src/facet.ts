/**
 * fastPower — 제곱으로 거듭제곱에 닿고, 그래서 얼마나 아끼는지 본다.
 *
 * 손잡이는 지수 하나다. 밀면 단순한 쪽(지수 − 1)은 폭발하는데 빠른 쪽은 자릿수를
 * 따라 한 칸씩만 는다. 주 수치는 **절약**이다 — 빠른 쪽은 13 과 20 에서 둘 다
 * 여섯이라 완전 단조가 아니고, 절약은 3 → 6 → 13 → 41 → 90 → 984 로 완전 단조다.
 *
 * `initialData` 에는 **1차 데이터만** 둔다 — 밑과 지수와 걸음 간격. 이진 표기도
 * 곱셈 횟수도 절약도 algorithm 이 직접 셈한다. 여기 적어 두면 지수를 바꿀 때
 * 화면이 조용히 거짓을 말하게 된다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const fastPowerFacet: FacetJson = {
  id: 'facet:fastPower',

  title: {
    en: 'Fast power',
    ko: '빠른 거듭제곱',
    ja: '高速な冪乗',
    zh: '快速幂',
    ar: 'الأس السريع',
    es: 'Potencia rápida',
    fr: 'Exponentiation rapide',
    hi: 'तेज़ घातांक',
    id: 'Pangkat cepat',
    pt: 'Potência rápida',
  },

  description: {
    en: 'Reaching a power by squaring instead of multiplying one at a time — push the exponent and the simple way explodes while the fast way barely moves.',
    ko: '하나씩 곱는 대신 제곱해 가며 거듭제곱에 닿는다. 지수를 밀면 단순한 쪽은 폭발하는데 빠른 쪽은 거의 움직이지 않는다.',
    ja: '一つずつ掛ける代わりに二乗を重ねて冪乗に届く。指数を動かすと単純な方は爆発し、速い方はほとんど動かない。',
    zh: '不逐个相乘，而是不断平方去到达幂。拨动指数，简单的一边爆炸式增长，快的一边几乎不动。',
    ar: 'بلوغ الأس بالتربيع بدل الضرب واحدة تلو الأخرى — حرّك الأس فتنفجر الطريقة البسيطة بينما تكاد السريعة لا تتحرك.',
    es: 'Llegar a una potencia elevando al cuadrado en vez de multiplicar de uno en uno: mueve el exponente y el camino simple estalla mientras el rápido apenas se mueve.',
    fr: "Atteindre une puissance en élevant au carré plutôt qu'en multipliant un par un : déplacez l'exposant, la voie simple explose tandis que la rapide bouge à peine.",
    hi: 'एक-एक करके गुणा करने के बजाय वर्ग करते हुए घात तक पहुँचना — घातांक बदलिए, सरल रास्ता फटता है जबकि तेज़ रास्ता मुश्किल से हिलता है।',
    id: 'Mencapai pangkat dengan mengkuadratkan alih-alih mengalikan satu per satu — geser eksponennya, cara sederhana meledak sementara cara cepat nyaris tak bergerak.',
    pt: 'Chegar a uma potência elevando ao quadrado em vez de multiplicar um a um — mova o expoente e o caminho simples explode enquanto o rápido mal se move.',
  },

  algorithm: 'module:fastPower',
  projector: 'module:fastPowerProjector',

  initialData: {
    type: 'fast-power',
    /** 밑. 조각(`squareAndHalve`)이 쓴 3 을 그대로 이어 받는다. */
    base: 3,
    /** 손잡이의 처음 자리. 되돌리면 control-bar 가 슬라이더도 이 값으로 돌린다. */
    exponent: 13,
    /**
     * 걸음 사이에 쉬는 시간. stage 의 운동이 그 앞에 더해진다 — 가장 얇은 걸음
     * (자리 건너뛰기)이 340ms 라 벽시계는 900ms 이고 실측은 915ms 였다. 800ms
     * 바닥선은 `S-piece` 85–87 을 완제품에 준용한 것이다.
     */
    stepMs: 560,
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
    stage: { type: 'fast-power-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        ...CONTROL_SET.playback,
        {
          widget: 'segmented-slider',
          action: 'exponent',
          name: 'exponent',
          label: {
            en: 'Exponent n',
            ko: '지수 n',
            ja: '指数 n',
            zh: '指数 n',
            ar: 'الأس n',
            es: 'Exponente n',
            fr: 'Exposant n',
            hi: 'घातांक n',
            id: 'Eksponen n',
            pt: 'Expoente n',
          },
          segments: [
            { value: 8, label: '8' },
            { value: 13, label: '13', default: true },
            { value: 20, label: '20' },
            { value: 50, label: '50' },
            { value: 100, label: '100' },
            { value: 1000, label: '1000' },
          ],
        },
      ],
      metrics: [
        {
          name: 'fast-mult-count',
          label: {
            en: 'Fast',
            ko: '빠름',
            ja: '速い',
            zh: '快',
            ar: 'السريعة',
            es: 'Rápido',
            fr: 'Rapide',
            hi: 'तेज़',
            id: 'Cepat',
            pt: 'Rápido',
          },
          initial: 0,
        },
        {
          name: 'slow-mult-count',
          label: {
            en: 'Simple',
            ko: '단순',
            ja: '単純',
            zh: '简单',
            ar: 'البسيطة',
            es: 'Simple',
            fr: 'Simple',
            hi: 'सरल',
            id: 'Sederhana',
            pt: 'Simples',
          },
          initial: 0,
        },
        {
          name: 'saved-mult-count',
          label: {
            en: 'Saved',
            ko: '절약',
            ja: '節約',
            zh: '省下',
            ar: 'الموفّر',
            es: 'Ahorro',
            fr: 'Économie',
            hi: 'बचत',
            id: 'Hemat',
            pt: 'Economia',
          },
          initial: 0,
        },
        {
          name: 'square-count',
          label: {
            en: 'Squarings',
            ko: '제곱',
            ja: '二乗',
            zh: '平方',
            ar: 'التربيعات',
            es: 'Cuadrados',
            fr: 'Carrés',
            hi: 'वर्ग',
            id: 'Kuadrat',
            pt: 'Quadrados',
          },
          initial: 0,
        },
      ],
    },
    codePanel: {
      type: 'code-view',
      ir: 'ir:fast-power-imperative',
      label: {
        en: 'What each way costs',
        ko: '두 방법이 치르는 값',
        ja: 'ふたつの道の代償',
        zh: '两种走法各要多少',
        ar: 'كلفة كل طريقة',
        es: 'Lo que cuesta cada camino',
        fr: 'Ce que coûte chaque voie',
        hi: 'हर रास्ते की कीमत',
        id: 'Berapa ongkos tiap jalan',
        pt: 'O que custa cada caminho',
      },
    },
  },

  messages: {
    'caption.begin': {
      en: 'The target is {base} to the {exponent}. Multiplying one at a time costs {slow} multiplications.',
      ko: '목표는 {base} 의 {exponent} 제곱. 하나씩 곱하면 곱셈은 {slow} 번.',
      ja: '目標は {base} の {exponent} 乗。一つずつ掛けると掛け算は {slow} 回。',
      zh: '目标是 {base} 的 {exponent} 次方。逐个相乘要 {slow} 次乘法。',
      ar: 'الهدف هو {base} أس {exponent}. الضرب واحدة تلو الأخرى يكلّف {slow} عملية ضرب.',
      es: 'El objetivo es {base} elevado a {exponent}. Multiplicar de uno en uno cuesta {slow} multiplicaciones.',
      fr: "L'objectif est {base} puissance {exponent}. Multiplier un par un coûte {slow} multiplications.",
      hi: 'लक्ष्य है {base} की घात {exponent}। एक-एक करके गुणा करने में {slow} गुणा लगते हैं।',
      id: 'Targetnya {base} pangkat {exponent}. Mengalikan satu per satu menelan {slow} perkalian.',
      pt: 'O alvo é {base} elevado a {exponent}. Multiplicar um a um custa {slow} multiplicações.',
    },

    'caption.square': {
      en: 'Squaring once more reaches {base} to the {place}. That is one multiplication, and the reach doubles.',
      ko: '한 번 더 제곱하면 {base} 의 {place} 제곱에 닿는다. 곱셈 한 번에 폭이 두 배.',
      ja: 'もう一度二乗すると {base} の {place} 乗に届く。掛け算一回で幅が二倍。',
      zh: '再平方一次就到达 {base} 的 {place} 次方。一次乘法，覆盖的幅度翻倍。',
      ar: 'تربيع آخر يبلغ {base} أس {place}. عملية ضرب واحدة، والمدى يتضاعف.',
      es: 'Elevar otra vez al cuadrado llega a {base} elevado a {place}. Una multiplicación y el alcance se duplica.',
      fr: "Un carré de plus atteint {base} puissance {place}. Une multiplication, et la portée double.",
      hi: 'एक बार और वर्ग करने पर {base} की घात {place} तक पहुँचते हैं। एक गुणा में पहुँच दोगुनी।',
      id: 'Sekali lagi dikuadratkan sampai ke {base} pangkat {place}. Satu perkalian, dan jangkauannya berlipat dua.',
      pt: 'Elevar ao quadrado mais uma vez alcança {base} elevado a {place}. Uma multiplicação, e o alcance dobra.',
    },

    'caption.take': {
      en: 'The digit is 1, so the answer takes {base} to the {place}. Multiplications so far: {mults}.',
      ko: '자리의 숫자가 1 이라 답이 {base} 의 {place} 제곱을 받는다. 여기까지 곱셈: {mults}.',
      ja: '桁の数字が 1 なので答えが {base} の {place} 乗を受け取る。ここまでの掛け算: {mults}。',
      zh: '这一位是 1，所以答案取走 {base} 的 {place} 次方。到此为止的乘法：{mults}。',
      ar: 'الرقم في هذه الخانة 1، فيأخذ الجواب {base} أس {place}. عدد الضربات حتى الآن: {mults}.',
      es: 'El dígito es 1, así que la respuesta toma {base} elevado a {place}. Multiplicaciones hasta aquí: {mults}.',
      fr: "Le chiffre est 1, donc la réponse prend {base} puissance {place}. Multiplications jusqu'ici : {mults}.",
      hi: 'अंक 1 है, इसलिए उत्तर {base} की घात {place} ले लेता है। अब तक के गुणा: {mults}।',
      id: 'Digitnya 1, jadi jawaban mengambil {base} pangkat {place}. Perkalian sejauh ini: {mults}.',
      pt: 'O dígito é 1, então a resposta leva {base} elevado a {place}. Multiplicações até aqui: {mults}.',
    },

    'caption.skip': {
      en: 'The digit is 0, so the answer takes nothing here. Multiplications so far: {mults}.',
      ko: '자리의 숫자가 0 이라 답이 받는 것이 없다. 여기까지 곱셈: {mults}.',
      ja: '桁の数字が 0 なので答えが受け取るものはない。ここまでの掛け算: {mults}。',
      zh: '这一位是 0，所以答案在这里什么也不取。到此为止的乘法：{mults}。',
      ar: 'الرقم في هذه الخانة 0، فلا يأخذ الجواب شيئًا هنا. عدد الضربات حتى الآن: {mults}.',
      es: 'El dígito es 0, así que aquí la respuesta no toma nada. Multiplicaciones hasta aquí: {mults}.',
      fr: "Le chiffre est 0, donc la réponse ne prend rien ici. Multiplications jusqu'ici : {mults}.",
      hi: 'अंक 0 है, इसलिए यहाँ उत्तर कुछ नहीं लेता। अब तक के गुणा: {mults}।',
      id: 'Digitnya 0, jadi di sini jawaban tidak mengambil apa pun. Perkalian sejauh ini: {mults}.',
      pt: 'O dígito é 0, então aqui a resposta não leva nada. Multiplicações até aqui: {mults}.',
    },

    'caption.verdict': {
      en: 'Exponent {exponent} is {bits} in binary. Fast {fast} multiplications against simple {slow} — saved {saved}.',
      ko: '지수 {exponent} — 이진수로 {bits}. 빠른 쪽 곱셈 {fast}, 단순한 쪽 {slow}, 아낀 것 {saved}.',
      ja: '指数 {exponent} — 二進数で {bits}。速い方の掛け算 {fast}、単純な方 {slow}、節約 {saved}。',
      zh: '指数 {exponent} —— 二进制是 {bits}。快的一边乘法 {fast} 次，简单的一边 {slow} 次，省下 {saved} 次。',
      ar: 'الأس {exponent} يساوي {bits} بالنظام الثنائي. الطريقة السريعة {fast} ضربة مقابل {slow} للبسيطة — وُفّر {saved}.',
      es: 'El exponente {exponent} es {bits} en binario. Rápido {fast} multiplicaciones frente a {slow} del simple: ahorro de {saved}.',
      fr: "L'exposant {exponent} s'écrit {bits} en binaire. Rapide : {fast} multiplications contre {slow} — {saved} économisées.",
      hi: 'घातांक {exponent} द्विआधारी में {bits} है। तेज़ तरीका {fast} गुणा, सरल तरीका {slow} — बचत {saved}।',
      id: 'Eksponen {exponent} adalah {bits} dalam biner. Cara cepat {fast} perkalian melawan {slow} cara sederhana — hemat {saved}.',
      pt: 'O expoente {exponent} é {bits} em binário. Rápido {fast} multiplicações contra {slow} do simples — economia de {saved}.',
    },

    'caption.waiting': {
      en: 'Move the exponent and watch what the saving becomes.',
      ko: '지수를 밀어 절약이 어떻게 되는지 보라.',
      ja: '指数を動かして節約がどうなるか見てほしい。',
      zh: '拨动指数，看看节省会变成多少。',
      ar: 'حرّك الأس وانظر كم يصير التوفير.',
      es: 'Mueve el exponente y observa en qué se convierte el ahorro.',
      fr: "Déplacez l'exposant et voyez ce que devient l'économie.",
      hi: 'घातांक बदलें और देखें कि बचत कितनी हो जाती है।',
      id: 'Geser eksponennya dan lihat jadi berapa penghematannya.',
      pt: 'Mova o expoente e veja no que dá a economia.',
    },

    'label.fast': {
      en: 'fast',
      ko: '빠름',
      ja: '速い',
      zh: '快',
      ar: 'السريعة',
      es: 'rápido',
      fr: 'rapide',
      hi: 'तेज़',
      id: 'cepat',
      pt: 'rápido',
    },

    'label.slow': {
      en: 'simple',
      ko: '단순',
      ja: '単純',
      zh: '简单',
      ar: 'البسيطة',
      es: 'simple',
      fr: 'simple',
      hi: 'सरल',
      id: 'sederhana',
      pt: 'simples',
    },

    'label.saved': {
      en: 'saved {saved}',
      ko: '절약 {saved}',
      ja: '節約 {saved}',
      zh: '省下 {saved}',
      ar: 'وُفّر {saved}',
      es: 'ahorro {saved}',
      fr: 'économie {saved}',
      hi: 'बचत {saved}',
      id: 'hemat {saved}',
      pt: 'economia {saved}',
    },

    'label.answer': {
      en: 'answer',
      ko: '답',
      ja: '答え',
      zh: '答案',
      ar: 'الجواب',
      es: 'respuesta',
      fr: 'réponse',
      hi: 'उत्तर',
      id: 'jawaban',
      pt: 'resposta',
    },

    'label.span': {
      en: 'span',
      ko: '폭',
      ja: '幅',
      zh: '幅',
      ar: 'المدى',
      es: 'alcance',
      fr: 'portée',
      hi: 'पहुँच',
      id: 'jangkauan',
      pt: 'alcance',
    },

    'label.digit': {
      en: 'digit',
      ko: '자리',
      ja: '桁',
      zh: '位',
      ar: 'الخانة',
      es: 'dígito',
      fr: 'chiffre',
      hi: 'अंक',
      id: 'digit',
      pt: 'dígito',
    },
  },
};
