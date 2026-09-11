/**
 * facet:hyperloglog — 조각 둘이 말한 두 점을 한 축 위에 세운다.
 *
 * `leadingZerosTell` 은 통이 하나일 때를 말하고 `averageTheBuckets` 는 통이 넷일
 * 때를 말한다. 둘은 고정 데이터로 한 장면씩 말하고 멈춘다. 여기서는 독자가 그
 * 축을 직접 밀어, 두 조각이 한 물건의 두 지점이었음을 본다.
 *
 * `keys` 는 서로 다른 96 개이고 번호 순이다 — 차례는 뜻을 지지 않는다. 통별
 * 최댓값은 순서를 타지 않기 때문이다. 통 번호 · ρ · 통별 최댓값 · 추정값은 여기
 * 적지 않는다. 해시(murmur3 32bit seed 0)와 위 목록만이 1차 데이터이고 나머지는
 * algorithm 이 셈한다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

/** host-0001 … host-0096. 손으로 적으면 한 줄이 틀려도 아무도 모른다. */
const KEYS: string[] = Array.from({ length: 96 }, (_, i) => `host-${String(i + 1).padStart(4, '0')}`);

export const hyperloglogFacet: FacetJson = {
  id: 'facet:hyperloglog',

  title: {
    en: 'HyperLogLog',
    ko: 'HyperLogLog',
    ja: 'HyperLogLog',
    zh: 'HyperLogLog',
    ar: 'HyperLogLog',
    es: 'HyperLogLog',
    fr: 'HyperLogLog',
    hi: 'HyperLogLog',
    id: 'HyperLogLog',
    pt: 'HyperLogLog',
  },

  description: {
    en: 'Count how many different things went by without keeping any of them — and push the bucket count to watch the error shrink.',
    ko: '본 것을 하나도 간직하지 않고 서로 다른 것의 수를 센다 — 통 수를 밀어 오차가 줄어드는 것을 본다.',
    ja: '何ひとつ保存せずに異なるものの数を数える — 容器の数を動かして誤差が縮むのを見る。',
    zh: '不保存任何元素也能数出有多少不同的东西 — 推动桶数，看误差如何变小。',
    ar: 'نعدّ كم شيئًا مختلفًا مرّ دون حفظ أي منها — وحرّك عدد الدلاء لترى الخطأ يتقلّص.',
    es: 'Cuenta cuántas cosas distintas pasaron sin guardar ninguna y mueve el número de cubos para ver encogerse el error.',
    fr: 'Comptez combien de choses différentes sont passées sans en garder aucune, puis changez le nombre de seaux pour voir le décalage se réduire.',
    hi: 'बिना कुछ संचित किए गिनें कि कितनी अलग-अलग चीज़ें गुज़रीं — और बाल्टियों की संख्या बढ़ाकर त्रुटि घटते देखें।',
    id: 'Hitung berapa banyak hal berbeda yang lewat tanpa menyimpan satu pun — lalu geser jumlah ember dan lihat galatnya menyusut.',
    pt: 'Conte quantas coisas diferentes passaram sem guardar nenhuma e mova o número de baldes para ver o erro encolher.',
  },

  algorithm: 'module:hyperloglog',
  projector: 'module:hyperloglogProjector',

  initialData: {
    type: 'hyperloglog',
    stepMs: 80,
    bucketCount: 4,
    keys: KEYS,
  },

  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'header' }, { ref: 'stage', padding: '8px 0' }, { ref: 'controls' }],
  },

  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'hyperloglog-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        ...CONTROL_SET.playback,
        {
          widget: 'segmented-slider',
          action: 'buckets',
          name: 'buckets',
          label: {
            en: 'Buckets',
            ko: '통 수',
            ja: 'バケット数',
            zh: '桶数',
            ar: 'عدد الدلاء',
            es: 'Cubos',
            fr: 'Seaux',
            hi: 'बाल्टियाँ',
            id: 'Ember',
            pt: 'Baldes',
          },
          segments: [
            { value: 1, label: '1' },
            { value: 2, label: '2' },
            { value: 4, label: '4', default: true },
            { value: 8, label: '8' },
            { value: 16, label: '16' },
          ],
        },
      ],
      metrics: [
        {
          name: 'key-count',
          label: {
            en: 'Keys',
            ko: '열쇠',
            ja: 'キー',
            zh: '键',
            ar: 'المفاتيح',
            es: 'Claves',
            fr: 'Clés',
            hi: 'कुंजियाँ',
            id: 'Kunci',
            pt: 'Chaves',
          },
          initial: 0,
        },
        {
          name: 'raise-count',
          label: {
            en: 'Raises',
            ko: '올라선 횟수',
            ja: '上昇回数',
            zh: '上升次数',
            ar: 'الارتفاعات',
            es: 'Subidas',
            fr: 'Hausses',
            hi: 'चढ़ाव',
            id: 'Kenaikan',
            pt: 'Subidas',
          },
          initial: 0,
        },
      ],
    },
  },

  messages: {
    'caption.spread': {
      en: 'Buckets {m}. The top {p} bits pick the bucket, the rest count the run.',
      ko: '통 {m} 개. 앞 {p} 비트가 통을 고르고, 나머지가 0 의 길이를 센다.',
      ja: 'バケット {m} 個。先頭 {p} ビットがバケットを選び、残りが連続する 0 を数える。',
      zh: '桶 {m} 个。前 {p} 位选桶，其余位数前导零的长度。',
      ar: 'الدلاء {m}. أول {p} بت تختار الدلو، والباقي يعدّ سلسلة الأصفار.',
      es: 'Cubos {m}. Los primeros {p} bits eligen el cubo; el resto cuenta la racha.',
      fr: 'Seaux {m}. Les {p} premiers bits choisissent le seau, le reste compte la série.',
      hi: 'बाल्टियाँ {m}. पहले {p} बिट बाल्टी चुनते हैं, बाकी शून्यों की लंबाई गिनते हैं।',
      id: 'Ember {m}. {p} bit pertama memilih ember, sisanya menghitung deret nol.',
      pt: 'Baldes {m}. Os primeiros {p} bits escolhem o balde; o resto conta a sequência.',
    },
    'caption.single': {
      en: 'One bucket. All 32 bits count the run, and one lucky key drags the whole answer.',
      ko: '통은 하나. 32 비트 전부가 0 의 길이를 세고, 운 좋은 열쇠 하나가 답을 통째로 끌고 간다.',
      ja: 'バケットは一つ。32 ビットすべてで連続する 0 を数え、運のよいキー一つが答えを丸ごと引きずる。',
      zh: '只有一个桶。全部 32 位都用来数前导零，一个走运的键就把整个答案带偏。',
      ar: 'دلو واحد. كل الـ 32 بت تعدّ سلسلة الأصفار، ومفتاح محظوظ واحد يجرّ الجواب كلّه.',
      es: 'Un solo cubo. Los 32 bits cuentan la racha y una sola clave afortunada arrastra toda la respuesta.',
      fr: 'Un seul seau. Les 32 bits comptent la série et une seule clé chanceuse entraîne toute la réponse.',
      hi: 'बाल्टी एक ही। सभी 32 बिट शून्यों की लंबाई गिनते हैं, और एक भाग्यशाली कुंजी पूरा उत्तर खींच ले जाती है।',
      id: 'Hanya satu ember. Semua 32 bit menghitung deret nol, dan satu kunci yang beruntung menyeret seluruh jawaban.',
      pt: 'Um único balde. Todos os 32 bits contam a sequência e uma única chave sortuda arrasta toda a resposta.',
    },
    'caption.hash': {
      en: 'Bucket {b} keeps {kept}. This key brought {rho}.',
      ko: '통 {b} 이 쥔 값은 {kept}. 이 열쇠가 들고 온 것은 {rho}.',
      ja: 'バケット {b} が持つ値は {kept}。このキーが持ってきたのは {rho}。',
      zh: '桶 {b} 留着 {kept}。这个键带来的是 {rho}。',
      ar: 'الدلو {b} يحتفظ بـ {kept}. هذا المفتاح جلب {rho}.',
      es: 'El cubo {b} guarda {kept}. Esta clave trajo {rho}.',
      fr: 'Le seau {b} garde {kept}. Cette clé a apporté {rho}.',
      hi: 'बाल्टी {b} रखती है {kept}. यह कुंजी लाई {rho}.',
      id: 'Ember {b} menyimpan {kept}. Kunci ini membawa {rho}.',
      pt: 'O balde {b} guarda {kept}. Esta chave trouxe {rho}.',
    },
    'caption.raise': {
      en: 'Bucket {b} rises to {rho}. That is the longest run it has seen.',
      ko: '통 {b} 이 {rho} 로 올라선다. 그 통이 본 것 중 가장 긴 0 이다.',
      ja: 'バケット {b} が {rho} に上がる。その容器が見た中で最も長い 0 の連なりだ。',
      zh: '桶 {b} 升到 {rho}。这是它见过的最长的一段零。',
      ar: 'الدلو {b} يرتفع إلى {rho}. هذه أطول سلسلة أصفار رآها.',
      es: 'El cubo {b} sube a {rho}. Es la racha más larga que ha visto.',
      fr: 'Le seau {b} monte à {rho}. La plus longue série vue par ce seau.',
      hi: 'बाल्टी {b} {rho} तक चढ़ती है। यह उसकी देखी सबसे लंबी श्रृंखला है।',
      id: 'Ember {b} naik ke {rho}. Itu deret terpanjang yang pernah dilihatnya.',
      pt: 'O balde {b} sobe para {rho}. É a maior sequência que ele viu.',
    },
    'caption.read': {
      en: 'Buckets {m} answer {est}. Truth is {truth}, off by {err} percent.',
      ko: '통 {m} 개의 답은 {est}. 참값은 {truth}, 오차 {err}%.',
      ja: 'バケット {m} 個の答えは {est}。真の値は {truth}、誤差 {err}%.',
      zh: '桶 {m} 个给出的答案是 {est}。真值是 {truth}，误差 {err}%.',
      ar: 'الدلاء {m} تجيب {est}. الحقيقة {truth}، بفارق {err}%.',
      es: '{m} cubos responden {est}. La verdad es {truth}, con un error del {err}%.',
      fr: '{m} seaux répondent {est}. La vérité est {truth}, écart de {err}%.',
      hi: '{m} बाल्टियाँ {est} बताती हैं। सच {truth} है, अंतर {err}%.',
      id: '{m} ember menjawab {est}. Sebenarnya {truth}, meleset {err}%.',
      pt: '{m} baldes respondem {est}. A verdade é {truth}, erro de {err}%.',
    },
    'caption.push': {
      en: 'Push the slider. Fewer buckets, wider miss.',
      ko: '손잡이를 밀어 보라. 통이 적을수록 더 크게 빗나간다.',
      ja: 'スライダーを動かしてみよう。容器が少ないほど大きく外れる。',
      zh: '推动滑块看看。桶越少，偏得越远。',
      ar: 'حرّك المؤشر. كلما قلّت الدلاء اتّسع الخطأ.',
      es: 'Mueve el control. Menos cubos, mayor desvío.',
      fr: 'Déplacez le curseur. Moins de seaux, plus grand écart.',
      hi: 'स्लाइडर को खिसकाइए। जितनी कम बाल्टियाँ, उतनी बड़ी चूक।',
      id: 'Geser slidernya. Makin sedikit ember, makin jauh melesetnya.',
      pt: 'Mova o controle. Menos baldes, maior desvio.',
    },
    'label.buckets': {
      en: 'buckets · largest run kept',
      ko: '통 · 가장 긴 0 만 남긴다',
      ja: 'バケット · 最も長い 0 だけ残す',
      zh: '桶 · 只留最长的一段零',
      ar: 'الدلاء · يبقى أطول تتابع',
      es: 'cubos · se guarda la racha mayor',
      fr: 'seaux · on garde la plus longue série',
      hi: 'बाल्टियाँ · सबसे लंबी श्रृंखला रहती है',
      id: 'ember · deret terpanjang disimpan',
      pt: 'baldes · guarda a maior sequência',
    },
    'label.estimate': {
      en: 'estimate',
      ko: '추정',
      ja: '推定',
      zh: '估计',
      ar: 'التقدير',
      es: 'estimación',
      fr: 'estimation',
      hi: 'अनुमान',
      id: 'perkiraan',
      pt: 'estimativa',
    },
    'label.truth': {
      en: 'true count {n}',
      ko: '참값 {n}',
      ja: '真の値 {n}',
      zh: '真值 {n}',
      ar: 'العدد الحقيقي {n}',
      es: 'valor real {n}',
      fr: 'valeur réelle {n}',
      hi: 'वास्तविक संख्या {n}',
      id: 'nilai sebenarnya {n}',
      pt: 'valor real {n}',
    },
    'label.error': {
      en: 'relative error by bucket count',
      ko: '통 수에 따른 상대오차',
      ja: 'バケット数ごとの相対誤差',
      zh: '按桶数的相对误差',
      ar: 'الخطأ النسبي بحسب عدد الدلاء',
      es: 'error relativo según el número de cubos',
      fr: 'erreur relative selon le nombre de seaux',
      hi: 'बाल्टियों की संख्या के अनुसार सापेक्ष त्रुटि',
      id: 'galat relatif menurut jumlah ember',
      pt: 'erro relativo por número de baldes',
    },
    'label.prefix': {
      en: 'bucket number',
      ko: '통 번호',
      ja: 'バケット番号',
      zh: '桶号',
      ar: 'رقم الدلو',
      es: 'número de cubo',
      fr: 'numéro de seau',
      hi: 'बाल्टी संख्या',
      id: 'nomor ember',
      pt: 'número do balde',
    },
    'label.rest': {
      en: 'run of zeros',
      ko: '앞자리 0 의 길이',
      ja: '先頭の 0 の長さ',
      zh: '前导零长度',
      ar: 'طول سلسلة الأصفار',
      es: 'racha de ceros',
      fr: 'série de zéros',
      hi: 'शून्यों की लंबाई',
      id: 'panjang deret nol',
      pt: 'sequência de zeros',
    },
  },
};
