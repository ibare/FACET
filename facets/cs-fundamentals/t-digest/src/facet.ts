import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

/**
 * @whole 적은 자리로 분위수를 답하되 꼬리를 정확히.
 *
 * 조각 `crowdTheTails` 가 "가운데를 성글게 하고 꼬리에 자리를 몰아준다" 를
 * 고정 데이터로 말하고 멈춘다. 이 완제품은 δ 를 손잡이로 주어 **그 대가가
 * 어디서 돌아오는지**를 보인다.
 *
 * 선언에 두는 것은 구조와 문안뿐이다. 뭉치 경계 · 무게 · 대표값 · 오차는
 * 전부 algorithm 이 셈하고, 그것이 화면의 어디인지는 stage 가 정한다.
 *
 * `layout` 에 `codePanel` 이 없는 것은 빠뜨린 것이 아니다 — IR 을 두지 않기로
 * 판정했고 까닭은 `irs.ts` 의 파일 주석에 적혀 있다.
 */
export const tDigestFacet: FacetJson = {
  id: 'facet:tDigest',
  title: {
    en: 'Answer quantiles from few slots, but get the tail right',
    ko: '적은 자리로 분위수를 답하되 꼬리를 정확히',
    ja: '少ない席で分位に答え、それでも尾を正確に',
    zh: '用很少的位置回答分位数，但把尾部答准',
    ar: 'أجب عن الكميات بمواضع قليلة مع ضبط الطرف',
    es: 'Responder cuantiles con pocas casillas, pero acertar en la cola',
    fr: 'Répondre aux quantiles avec peu de places, sans rater la queue',
    hi: 'कम जगहों से क्वांटाइल का उत्तर, फिर भी पूँछ सटीक',
    id: 'Menjawab kuantil dengan sedikit slot, tetapi ekornya tepat',
    pt: 'Responder quantis com poucas casas, acertando a cauda',
  },
  description: {
    en: 'Raise the compression δ and the tail error falls far faster than the middle — that is what crowding the tails buys.',
    ko: '압축 계수 δ 를 올리면 꼬리 오차가 가운데보다 훨씬 빠르게 준다 — 꼬리에 자리를 몰아준 값이 이것이다.',
    ja: '圧縮係数δを上げると、尾の誤差は真ん中よりずっと速く減る — 尾に席を寄せて買ったものがこれだ。',
    zh: '提高压缩系数 δ，尾部误差比中间下降得快得多 —— 这就是把刻度挤向尾部换来的东西。',
    ar: 'ارفع معامل الضغط δ فينخفض خطأ الطرف أسرع بكثير من الوسط — هذا ما يشتريه ازدحام الأطراف.',
    es: 'Sube la compresión δ y el error de la cola cae mucho más rápido que el del centro: eso es lo que compra apiñar las colas.',
    fr: "Augmentez la compression δ et l'erreur de queue chute bien plus vite que celle du centre : voilà ce qu'achète le serrage des queues.",
    hi: 'संपीड़न δ बढ़ाइए और पूँछ की त्रुटि बीच से कहीं तेज़ी से घटती है — पूँछों पर भीड़ करने से यही मिलता है।',
    id: 'Naikkan kompresi δ dan galat ekor turun jauh lebih cepat daripada tengah — itulah yang dibeli dengan memadatkan ekor.',
    pt: 'Aumente a compressão δ e o erro da cauda cai muito mais rápido que o do meio — é isso que adensar as caudas compra.',
  },
  algorithm: 'module:tDigest',
  projector: 'module:tDigestProjector',
  initialData: {
    type: 't-digest',
    /** 값의 수. */
    count: 200,
    /** 압축 계수 δ 의 처음 값. 손잡이의 기본과 같아야 한다. */
    delta: 12,
    /** 손잡이가 고를 수 있는 δ 전부. 나란히 세워 견주는 데 쓴다. */
    deltas: [6, 12, 24, 48],
    /** 꼬리 쪽 질의 분위. */
    tailQ: 0.99,
    /** 가운데 질의 분위. */
    middleQ: 0.5,
    /** 걸음 사이의 정지 시간 (ms). */
    stepMs: 700,
  },
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'header' }, { ref: 'stage', padding: '8px 0' }, { ref: 'controls' }],
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 't-digest-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        ...CONTROL_SET.playback,
        {
          widget: 'segmented-slider',
          action: 'delta',
          name: 'delta',
          // 손잡이의 라벨은 이름이지 설명이 아니다. δ 는 수식 기호라 열 언어가
          // 같은 글자를 쓴다.
          label: {
            en: 'δ',
            ko: 'δ',
            ja: 'δ',
            zh: 'δ',
            ar: 'δ',
            es: 'δ',
            fr: 'δ',
            hi: 'δ',
            id: 'δ',
            pt: 'δ',
          },
          // 숫자는 표식이라 번역하지 않는다 (C10).
          segments: [
            { value: 6, label: '6' },
            { value: 12, label: '12', default: true },
            { value: 24, label: '24' },
            { value: 48, label: '48' },
          ],
        },
      ],
      metrics: [
        {
          name: 'bucket-count',
          label: {
            en: 'Buckets',
            ko: '뭉치',
            ja: 'バケット',
            zh: '桶数',
            ar: 'الدلاء',
            es: 'Cubos',
            fr: 'Seaux',
            hi: 'बाल्टियाँ',
            id: 'Ember',
            pt: 'Baldes',
          },
          initial: 0,
        },
        {
          name: 'tail-bucket-size',
          label: {
            en: 'Tail bucket',
            ko: '꼬리 뭉치',
            ja: '尾のバケット',
            zh: '尾部桶',
            ar: 'دلو الطرف',
            es: 'Cubo de cola',
            fr: 'Seau de queue',
            hi: 'पूँछ बाल्टी',
            id: 'Ember ekor',
            pt: 'Balde da cauda',
          },
          initial: 0,
        },
        {
          name: 'widest-bucket-size',
          label: {
            en: 'Widest bucket',
            ko: '가장 큰 뭉치',
            ja: '最大のバケット',
            zh: '最大的桶',
            ar: 'أوسع دلو',
            es: 'Cubo más ancho',
            fr: 'Seau le plus large',
            hi: 'सबसे बड़ी बाल्टी',
            id: 'Ember terbesar',
            pt: 'Balde maior',
          },
          initial: 0,
        },
      ],
    },
  },
  messages: {
    'label.axis': {
      en: 'Quantile q',
      ko: '분위 q',
      ja: '分位 q',
      zh: '分位 q',
      ar: 'الكمّية q',
      es: 'Cuantil q',
      fr: 'Quantile q',
      hi: 'क्वांटाइल q',
      id: 'Kuantil q',
      pt: 'Quantil q',
    },
    'label.digest': {
      en: '{sym} = {delta}, buckets {count}',
      ko: '{sym} = {delta}, 뭉치 {count}',
      ja: '{sym} = {delta}、バケット {count}',
      zh: '{sym} = {delta}，桶 {count}',
      ar: '{sym} = {delta}، الدلاء {count}',
      es: '{sym} = {delta}, cubos {count}',
      fr: '{sym} = {delta}, seaux {count}',
      hi: '{sym} = {delta}, बाल्टियाँ {count}',
      id: '{sym} = {delta}, ember {count}',
      pt: '{sym} = {delta}, baldes {count}',
    },
    'label.cellHint': {
      en: 'each cell holds this many of {total} points',
      ko: '칸마다 담은 점의 수. 전체 {total}',
      ja: '各セルが抱える点の数。全体 {total}',
      zh: '每格所装的点数，总共 {total}',
      ar: 'عدد النقاط في كل خانة، من أصل {total}',
      es: 'cada casilla guarda esta cantidad de {total} puntos',
      fr: 'chaque case contient ce nombre de points sur {total}',
      hi: 'हर खाने में इतने बिंदु, कुल {total}',
      id: 'tiap sel menampung sekian dari {total} titik',
      pt: 'cada célula guarda esta quantidade de {total} pontos',
    },
    'label.tail': {
      en: 'Tail',
      ko: '꼬리',
      ja: '尾',
      zh: '尾部',
      ar: 'الطرف',
      es: 'Cola',
      fr: 'Queue',
      hi: 'पूँछ',
      id: 'Ekor',
      pt: 'Cauda',
    },
    'label.middle': {
      en: 'Middle',
      ko: '가운데',
      ja: '真ん中',
      zh: '中间',
      ar: 'الوسط',
      es: 'Centro',
      fr: 'Centre',
      hi: 'बीच',
      id: 'Tengah',
      pt: 'Meio',
    },
    'label.answer': {
      en: 'answers {value}',
      ko: '답한 값 {value}',
      ja: '答えた値 {value}',
      zh: '答出 {value}',
      ar: 'الجواب {value}',
      es: 'responde {value}',
      fr: 'répond {value}',
      hi: 'उत्तर {value}',
      id: 'menjawab {value}',
      pt: 'responde {value}',
    },
    'label.truth': {
      en: 'truth {value}',
      ko: '참값 {value}',
      ja: '真の値 {value}',
      zh: '真值 {value}',
      ar: 'القيمة الحقيقية {value}',
      es: 'valor real {value}',
      fr: 'valeur vraie {value}',
      hi: 'सही मान {value}',
      id: 'nilai benar {value}',
      pt: 'valor real {value}',
    },
    'label.valueOff': {
      en: 'off by {value}%',
      ko: '오차 {value}%',
      ja: '誤差 {value}%',
      zh: '误差 {value}%',
      ar: 'خطأ {value}%',
      es: 'error {value}%',
      fr: 'écart {value}%',
      hi: 'त्रुटि {value}%',
      id: 'galat {value}%',
      pt: 'erro {value}%',
    },
    'label.sweep': {
      en: 'Value error as {sym} grows',
      ko: '{sym} 를 늘렸을 때의 값 오차',
      ja: '{sym} を増やしたときの値の誤差',
      zh: '{sym} 增大时的数值误差',
      ar: 'خطأ القيمة مع تزايد {sym}',
      es: 'Error de valor a medida que crece {sym}',
      fr: 'Erreur de valeur à mesure que {sym} croît',
      hi: '{sym} बढ़ने पर मान त्रुटि',
      id: 'Galat nilai saat {sym} membesar',
      pt: 'Erro de valor conforme {sym} cresce',
    },
    'caption.claim': {
      en: 'Raise {sym} and the tail sharpens faster than the middle — that is what crowding the tails buys.',
      ko: '{sym} 를 올리면 꼬리가 가운데보다 빠르게 좋아진다. 꼬리에 자리를 몰아준 값이 이것이다.',
      ja: '{sym} を上げると、尾は真ん中より速く良くなる。尾に席を寄せて買ったものがこれだ。',
      zh: '提高 {sym}，尾部比中间改善得更快 —— 这就是把刻度挤向尾部换来的东西。',
      ar: 'ارفع {sym} فيتحسّن الطرف أسرع من الوسط — هذا ما يشتريه ازدحام الأطراف.',
      es: 'Sube {sym} y la cola mejora más rápido que el centro: eso es lo que compra apiñar las colas.',
      fr: "Augmentez {sym} et la queue s'affine plus vite que le centre : voilà ce qu'achète le serrage des queues.",
      hi: '{sym} बढ़ाइए और पूँछ बीच से तेज़ी से सुधरती है — पूँछों पर भीड़ करने से यही मिलता है।',
      id: 'Naikkan {sym} dan ekor membaik lebih cepat daripada tengah — itulah yang dibeli dengan memadatkan ekor.',
      pt: 'Aumente {sym} e a cauda melhora mais rápido que o meio — é isso que adensar as caudas compra.',
    },
  },
};
