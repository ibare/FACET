import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

/**
 * @piece 분위수를 재는 그릇은 자리를 어떻게 나누는가 — 가운데를 성글게 하고
 * 꼬리에 몰아준다.
 *
 * 선언에 두는 것은 구조뿐이다. 점의 수와 압축 계수 δ 에서 경계와 뭉치의 크기가
 * 나오고(algorithm), 그 경계가 화면의 어디인지는 그림이 정한다(stage).
 */
export const crowdTheTailsFacet: FacetJson = {
  id: 'facet:crowdTheTails',
  title: {
    en: 'Crowd the tails',
    ko: '꼬리에 자리를 몰아준다',
    ja: '尾に席を寄せる',
    zh: '把刻度挤向尾部',
    ar: 'ازدحام عند الأطراف',
    es: 'Apiñar las colas',
    fr: 'Serrer les queues',
    hi: 'पूँछों पर भीड़',
    id: 'Memadatkan ekor',
    pt: 'Adensar as caudas',
  },
  description: {
    en: 'A quantile digest gives the tails more buckets than the middle.',
    ko: '분위수를 재는 그릇은 가운데보다 꼬리에 자리를 더 준다.',
    ja: '分位を測るダイジェストは、真ん中より尾に多くのバケットを割り当てる。',
    zh: '分位摘要把更多的桶分给尾部，而不是中间。',
    ar: 'يمنح ملخص الكميات الأطراف دلاءً أكثر من الوسط.',
    es: 'Un resumen de cuantiles da más cubos a las colas que al centro.',
    fr: "Un résumé de quantiles donne plus de seaux aux queues qu'au centre.",
    hi: 'क्वांटाइल डाइजेस्ट बीच की तुलना में पूँछों को अधिक बाल्टियाँ देता है।',
    id: 'Ringkasan kuantil memberi lebih banyak ember untuk ekor daripada bagian tengah.',
    pt: 'Um resumo de quantis dá mais baldes às caudas do que ao meio.',
  },
  algorithm: 'module:crowdTheTails',
  projector: 'module:crowdTheTailsProjector',
  initialData: {
    type: 'crowd-the-tails',
    /** 정렬된 점의 수. */
    count: 60,
    /** 압축 계수 δ — 뭉치 수는 δ/2 다. */
    delta: 12,
    /** 걸음 사이의 정지 시간 (ms). */
    stepMs: 850,
  },
  blocks: {
    stage: { type: 'crowd-the-tails-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.even': {
      en: 'Cut the quantile line into {parts} equal buckets: {count} points in each.',
      ko: '분위 선을 고르게 {parts} 조각으로 자르면, 그릇마다 점 {count}.',
      ja: '分位の線を{parts}等分に切ると、各バケットに入る点は{count}。',
      zh: '把分位线均分成 {parts} 段：每个桶里有 {count} 个点。',
      ar: 'قسّم خط الكميات إلى {parts} أجزاء متساوية: في كل دلو {count} نقطة.',
      es: 'Corta la línea de cuantiles en {parts} partes iguales: {count} puntos en cada cubo.',
      fr: 'Coupez la ligne des quantiles en {parts} parts égales : {count} points par seau.',
      hi: 'क्वांटाइल रेखा को {parts} बराबर हिस्सों में काटें: हर बाल्टी में {count} बिंदु।',
      id: 'Potong garis kuantil menjadi {parts} bagian sama besar: {count} titik di tiap ember.',
      pt: 'Corte a linha de quantis em {parts} partes iguais: {count} pontos em cada balde.',
    },
    'caption.scale': {
      en: 'Cut k in equal steps instead: near the ends one step covers far less of q.',
      ko: '대신 k 를 한 칸씩 자른다. 끝으로 갈수록 한 칸이 덮는 q 폭이 좁아진다.',
      ja: '代わりに k を等間隔で切る。端に近いほど一歩が覆う q の幅は狭くなる。',
      zh: '改为按等步长切 k：越靠近两端，一步覆盖的 q 越窄。',
      ar: 'اقطع k بخطوات متساوية بدلًا من ذلك: قرب الطرفين تغطي الخطوة الواحدة جزءًا أصغر بكثير من q.',
      es: 'Corta k en pasos iguales: cerca de los extremos un paso cubre mucho menos de q.',
      fr: 'Coupez plutôt k en pas égaux : près des bords, un pas couvre bien moins de q.',
      hi: 'इसके बजाय k को बराबर कदमों में काटें: किनारों के पास एक कदम q का बहुत कम हिस्सा ढकता है।',
      id: 'Potong k dengan langkah sama besar: di dekat ujung, satu langkah menutup jauh lebih sedikit q.',
      pt: 'Corte k em passos iguais: perto das pontas, um passo cobre bem menos de q.',
    },
    'caption.fillMiddle': {
      en: 'The middle buckets swallow {count} points each — coarse, and no harm done.',
      ko: '가운데 그릇이 삼키는 점은 {count}. 굵어도 탈이 없다.',
      ja: '真ん中のバケットが飲み込む点は{count}。粗くても困らない。',
      zh: '中间的桶各吞下 {count} 个点 —— 粗一些也无妨。',
      ar: 'يبتلع كل دلو في الوسط {count} نقطة — خشن، ولا ضرر في ذلك.',
      es: 'Cada cubo central se traga {count} puntos: es grueso, y no pasa nada.',
      fr: 'Chaque seau du milieu avale {count} points : grossier, mais sans dommage.',
      hi: 'बीच की हर बाल्टी {count} बिंदु निगल लेती है — मोटा, पर हानि नहीं।',
      id: 'Tiap ember tengah menelan {count} titik — kasar, dan itu tidak masalah.',
      pt: 'Cada balde do meio engole {count} pontos — grosseiro, e sem problema.',
    },
    'caption.fillOuter': {
      en: 'The next pair out holds {count} each.',
      ko: '그 바깥 두 그릇이 담는 점은 {count}.',
      ja: 'その外側の二つが抱える点は{count}。',
      zh: '外侧的一对各装 {count} 个点。',
      ar: 'يحمل الزوج التالي نحو الخارج {count} نقطة لكل دلو.',
      es: 'El siguiente par hacia fuera guarda {count} en cada cubo.',
      fr: 'La paire suivante vers le bord contient {count} points chacune.',
      hi: 'बाहर की अगली जोड़ी में {count} बिंदु हैं।',
      id: 'Pasangan berikutnya menampung {count} titik tiap ember.',
      pt: 'O par seguinte guarda {count} em cada balde.',
    },
    'caption.fillTail': {
      en: 'Each tail bucket holds only {count}.',
      ko: '꼬리 그릇이 담는 점은 겨우 {count}.',
      ja: '尾のバケットが抱える点はわずか{count}。',
      zh: '两端的桶各自只装 {count} 个点。',
      ar: 'لا يحمل دلو الطرف سوى {count} نقطة.',
      es: 'Cada cubo de la cola guarda solo {count}.',
      fr: 'Chaque seau de queue ne garde que {count} points.',
      hi: 'पूँछ की हर बाल्टी में सिर्फ़ {count} बिंदु हैं।',
      id: 'Tiap ember ekor hanya menampung {count} titik.',
      pt: 'Cada balde da cauda guarda apenas {count}.',
    },
    'caption.digest': {
      en: 'One mark per bucket: {middle} points in the middle, {tail} at the tails — {ratio}x finer.',
      ko: '그릇마다 자국 하나. 가운데는 {middle}, 꼬리는 {tail} — 꼬리가 {ratio} 배 촘촘하다.',
      ja: 'バケットごとに印一つ。真ん中は{middle}、尾は{tail} — 尾は{ratio}倍細かい。',
      zh: '每个桶只留一个标记：中间 {middle} 个点，两端 {tail} 个 —— 尾部细 {ratio} 倍。',
      ar: 'علامة واحدة لكل دلو: {middle} نقطة في الوسط و{tail} عند الطرفين — أدق بـ {ratio} مرة.',
      es: 'Una marca por cubo: {middle} puntos en el centro, {tail} en las colas — {ratio}x más fino.',
      fr: 'Une marque par seau : {middle} points au centre, {tail} aux queues — {ratio}x plus fin.',
      hi: 'हर बाल्टी पर एक निशान: बीच में {middle} बिंदु, पूँछों पर {tail} — {ratio} गुना बारीक।',
      id: 'Satu tanda per ember: {middle} titik di tengah, {tail} di ekor — {ratio}x lebih halus.',
      pt: 'Uma marca por balde: {middle} pontos no meio, {tail} nas caudas — {ratio}x mais fino.',
    },
  },
};
