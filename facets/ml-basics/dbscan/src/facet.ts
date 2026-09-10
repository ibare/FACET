/**
 * DBSCAN 완결형 선언.
 *
 * 블록은 셋뿐이다 — `stage` · `controls` · `codePanel`. 제목 블록을 두지 않는다
 * (이름은 카탈로그 카드와 글의 문단이 준다). 점 · 번짐 · 스택 · 대조표는 빌트인
 * view 를 빌리지 않고 stage 가 직접 그린다.
 *
 * 이 완제품이 완제품인 까닭은 셋이 다 있어서다.
 *   - IR `ir:dbscan` 하나가 여섯 언어로 갈린다. 번짐이 통째로 펼쳐진다.
 *   - **손잡이 둘이 논증을 진다.** eps 슬라이더와 minPts 슬라이더가 없으면
 *     "두 손잡이는 서로 다른 것을 만진다" 를 말할 길이 없다.
 *   - 조각 둘(denseNeighborhood · noiseLeftOut)이 고정 손잡이로 한 장면씩
 *     말한 것을 한 화면에서 잇는다.
 *
 * 식별자 (C1): `point:<i>`.
 *
 * 자료는 크기와 밀도가 다른 덩이 넷과 외톨이 둘이다. 넷의 성김이 서로 달라야
 * minPts 를 올릴 때 **어느 덩이부터 무너지는가** 가 드러난다. 좌표만 두고
 * 거리 · 이웃 수 · 화면 자리는 전부 algorithm 과 stage 가 이 좌표에서 셈한다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

/**
 * 점 열아홉.
 *   0-5   A 여섯, 촘촘   (안쪽 간격 0.46)
 *   6-9   B 넷          (A 와 1.80)
 *   10-12 C 셋          (B 와 2.14)
 *   13-16 D 넷, 성김     (안쪽 간격 1.12, C 와 2.43)
 *   17-18 외톨이 둘
 */
const POINTS: Array<{ x: number; y: number }> = [
  { x: 1.0, y: 1.0 },
  { x: 1.6, y: 1.1 },
  { x: 1.1, y: 1.7 },
  { x: 1.7, y: 1.8 },
  { x: 1.35, y: 2.4 },
  { x: 0.9, y: 2.3 },

  { x: 3.4, y: 1.2 },
  { x: 4.0, y: 1.3 },
  { x: 3.5, y: 1.9 },
  { x: 4.1, y: 2.0 },

  { x: 6.2, y: 1.6 },
  { x: 6.8, y: 1.8 },
  { x: 6.4, y: 2.4 },

  { x: 9.2, y: 2.2 },
  { x: 10.3, y: 2.5 },
  { x: 9.5, y: 3.4 },
  { x: 10.6, y: 3.6 },

  { x: 2.2, y: 6.4 },
  { x: 8.4, y: 6.7 },
];

/**
 * 손잡이가 고를 수 있는 값.
 *
 * `initialData` 와 슬라이더 `segments` 가 **같은 배열**을 본다. 둘을 따로 적으면
 * 어긋날 수 있고, 어긋나면 위젯이 보내는 구간 번호가 알고리즘의 자리와 달라져
 * 조용히 엉뚱한 값으로 셈한다. 그래서 아래에서 `map` 으로 편다 — 로드 시점에
 * 평평한 데이터로 굳으므로 선언은 여전히 리터럴이다 (S-facet).
 */
const EPS_OPTIONS = [1.0, 1.3, 1.9, 2.4, 3.0];
const MIN_PTS_OPTIONS = [2, 3, 4, 5];

/** 처음 자리 — eps 1.3 · minPts 3. 덩이 넷이 넷으로 잡히고 외톨이 둘만 잡음이다. */
const INITIAL_EPS_INDEX = 1;
const INITIAL_MIN_PTS_INDEX = 1;

export const dbscanFacet: FacetJson = {
  id: 'facet:dbscan',
  title: {
    en: 'DBSCAN — two handles, two different things',
    ko: 'DBSCAN — 두 손잡이는 서로 다른 것을 만진다',
    ja: 'DBSCAN — 二つのつまみは別のものを触る',
    zh: 'DBSCAN — 两个旋钮拨的是不同的东西',
    ar: 'DBSCAN — مقبضان يمسّان شيئين مختلفين',
    es: 'DBSCAN: dos mandos que tocan cosas distintas',
    fr: 'DBSCAN — deux molettes qui touchent deux choses différentes',
    hi: 'DBSCAN — दो घुंडियाँ, दो अलग चीज़ें',
    id: 'DBSCAN — dua tuas menyentuh dua hal berbeda',
    pt: 'DBSCAN — dois botões que mexem em coisas diferentes',
  },
  description: {
    en: 'eps links what was apart; minPts breaks small blobs down. The same group count can come from very different pairs.',
    ko: 'eps 는 떨어져 있던 것을 잇고, minPts 는 작은 덩이를 무너뜨린다. 무리 수가 같아도 그 속내가 다르다.',
    ja: 'eps は離れていたものをつなぎ、minPts は小さな塊を崩す。群れの数が同じでも、その中身はまるで違う組み合わせから来る。',
    zh: 'eps 把原本分开的连起来，minPts 把小团打散。同样的组数，可能来自完全不同的两个取值。',
    ar: 'eps يصل ما كان متباعدًا، وminPts يفكّك الكتل الصغيرة. العدد نفسه من المجموعات قد يأتي من ثنائيات مختلفة تمامًا.',
    es: 'eps enlaza lo que estaba separado; minPts derrumba los grumos pequeños. El mismo número de grupos puede venir de pares muy distintos.',
    fr: 'eps relie ce qui était séparé ; minPts fait tomber les petits amas. Un même nombre de groupes peut venir de paires très différentes.',
    hi: 'eps जो अलग था उसे जोड़ता है; minPts छोटे गुच्छों को ढहा देता है। समूहों की वही संख्या बहुत अलग जोड़ियों से आ सकती है।',
    id: 'eps menyambung yang terpisah; minPts meruntuhkan gumpalan kecil. Jumlah kelompok yang sama bisa datang dari pasangan yang sangat berbeda.',
    pt: 'eps liga o que estava separado; minPts derruba os aglomerados pequenos. O mesmo número de grupos pode vir de pares bem diferentes.',
  },
  algorithm: 'module:dbscan',
  projector: 'module:dbscanProjector',
  initialData: {
    type: 'dbscan',
    points: POINTS,
    epsOptions: EPS_OPTIONS,
    minPtsOptions: MIN_PTS_OPTIONS,
    initialEpsIndex: INITIAL_EPS_INDEX,
    initialMinPtsIndex: INITIAL_MIN_PTS_INDEX,
    stepMs: 240,
  },
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'stage' }, { ref: 'controls' }, { ref: 'codePanel' }],
  },
  blocks: {
    stage: { type: 'dbscan-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        ...CONTROL_SET.playback,
        {
          widget: 'segmented-slider',
          action: 'eps',
          name: 'eps',
          label: 'eps',
          segments: EPS_OPTIONS.map((value, i) => ({
            value,
            label: value.toFixed(1),
            default: i === INITIAL_EPS_INDEX,
          })),
        },
        {
          widget: 'segmented-slider',
          action: 'min-pts',
          name: 'minPts',
          label: 'minPts',
          segments: MIN_PTS_OPTIONS.map((value, i) => ({
            value,
            label: String(value),
            default: i === INITIAL_MIN_PTS_INDEX,
          })),
        },
      ],
      metrics: [
        {
          name: 'cluster-count',
          label: {
            en: 'Groups',
            ko: '무리',
            ja: 'グループ',
            zh: '组数',
            ar: 'المجموعات',
            es: 'Grupos',
            fr: 'Groupes',
            hi: 'समूह',
            id: 'Kelompok',
            pt: 'Grupos',
          },
          initial: 0,
        },
        {
          name: 'noise-count',
          label: {
            en: 'Noise',
            ko: '잡음',
            ja: 'ノイズ',
            zh: '噪声',
            ar: 'الضجيج',
            es: 'Ruido',
            fr: 'Bruit',
            hi: 'शोर',
            id: 'Derau',
            pt: 'Ruído',
          },
          initial: 0,
        },
        {
          name: 'distance-count',
          label: {
            en: 'Distances',
            ko: '잰 거리',
            ja: '測った距離',
            zh: '测过的距离',
            ar: 'المسافات',
            es: 'Distancias',
            fr: 'Distances',
            hi: 'दूरियाँ',
            id: 'Jarak',
            pt: 'Distâncias',
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
      ir: 'ir:dbscan',
    },
  },
  messages: {
    'caption.start': {
      en: 'Points on the plane: {n}. No group yet.',
      ko: '평면 위의 점은 {n}. 아직 무리는 없다.',
      ja: '平面上の点は {n}。まだグループはない。',
      zh: '平面上的点: {n}。还没有分组。',
      ar: 'النقاط على المستوى: {n}. لا مجموعة بعد.',
      es: 'Puntos en el plano: {n}. Todavía no hay grupos.',
      fr: 'Points sur le plan : {n}. Pas encore de groupe.',
      hi: 'समतल पर बिंदु: {n}. अभी कोई समूह नहीं।',
      id: 'Titik di bidang: {n}. Belum ada kelompok.',
      pt: 'Pontos no plano: {n}. Ainda não há grupos.',
    },
    'caption.epsUp': {
      en: 'eps raised to {eps} — what was apart now links up.',
      ko: 'eps 를 {eps} 로 올렸다 — 떨어져 있던 것이 이어진다.',
      ja: 'eps を {eps} に上げた — 離れていたものがつながる。',
      zh: 'eps 提到 {eps} — 原本分开的连了起来。',
      ar: 'رُفع eps إلى {eps} — ما كان متباعدًا صار متصلًا.',
      es: 'eps sube a {eps}: lo que estaba separado ahora se enlaza.',
      fr: 'eps monté à {eps} — ce qui était séparé se relie.',
      hi: 'eps बढ़ाकर {eps} — जो अलग था वह अब जुड़ जाता है।',
      id: 'eps dinaikkan ke {eps} — yang terpisah kini tersambung.',
      pt: 'eps subiu para {eps} — o que estava separado agora se liga.',
    },
    'caption.epsDown': {
      en: 'eps lowered to {eps} — the links snap and groups fall apart.',
      ko: 'eps 를 {eps} 로 내렸다 — 이어졌던 것이 끊어져 무리가 갈라진다.',
      ja: 'eps を {eps} に下げた — つながりが切れてグループが割れる。',
      zh: 'eps 降到 {eps} — 连接断开，组也散了。',
      ar: 'خُفض eps إلى {eps} — تنقطع الوصلات وتتفكك المجموعات.',
      es: 'eps baja a {eps}: los enlaces se rompen y los grupos se separan.',
      fr: 'eps abaissé à {eps} — les liens cèdent et les groupes se séparent.',
      hi: 'eps घटाकर {eps} — कड़ियाँ टूटती हैं और समूह बिखर जाते हैं।',
      id: 'eps diturunkan ke {eps} — sambungan putus dan kelompok terpecah.',
      pt: 'eps desceu para {eps} — as ligações se rompem e os grupos se separam.',
    },
    'caption.minPtsUp': {
      en: 'minPts raised to {minPts} — thin blobs lose their core first.',
      ko: 'minPts 를 {minPts} 로 올렸다 — 성긴 덩이부터 속을 잃는다.',
      ja: 'minPts を {minPts} に上げた — 薄い塊から先に核を失う。',
      zh: 'minPts 提到 {minPts} — 稀疏的团先失去核心。',
      ar: 'رُفع minPts إلى {minPts} — الكتل المتفرقة تفقد نواتها أولًا.',
      es: 'minPts sube a {minPts}: los grumos ralos pierden su núcleo primero.',
      fr: 'minPts monté à {minPts} — les amas clairsemés perdent leur cœur en premier.',
      hi: 'minPts बढ़ाकर {minPts} — विरल गुच्छे पहले अपना केंद्र खोते हैं।',
      id: 'minPts dinaikkan ke {minPts} — gumpalan renggang kehilangan intinya lebih dulu.',
      pt: 'minPts subiu para {minPts} — os aglomerados ralos perdem o núcleo primeiro.',
    },
    'caption.minPtsDown': {
      en: 'minPts lowered to {minPts} — thin blobs get their core back.',
      ko: 'minPts 를 {minPts} 로 내렸다 — 성긴 덩이가 속을 되찾는다.',
      ja: 'minPts を {minPts} に下げた — 薄い塊が核を取り戻す。',
      zh: 'minPts 降到 {minPts} — 稀疏的团重新拿回核心。',
      ar: 'خُفض minPts إلى {minPts} — الكتل المتفرقة تستعيد نواتها.',
      es: 'minPts baja a {minPts}: los grumos ralos recuperan su núcleo.',
      fr: 'minPts abaissé à {minPts} — les amas clairsemés retrouvent leur cœur.',
      hi: 'minPts घटाकर {minPts} — विरल गुच्छे अपना केंद्र वापस पा लेते हैं।',
      id: 'minPts diturunkan ke {minPts} — gumpalan renggang mendapat intinya kembali.',
      pt: 'minPts desceu para {minPts} — os aglomerados ralos recuperam o núcleo.',
    },
    'caption.core': {
      en: 'Neighbours here: {n}. That reaches minPts, so this point is a core.',
      ko: '여기 이웃 수는 {n}. minPts 에 닿았으니 이 점은 핵심이다.',
      ja: 'ここの隣人は {n}。minPts に届いたので、この点は核だ。',
      zh: '这里的邻居有 {n} 个。达到了 minPts，所以这个点是核心。',
      ar: 'الجيران هنا: {n}. يبلغ ذلك minPts، فهذه النقطة نواة.',
      es: 'Vecinos aquí: {n}. Alcanza minPts, así que este punto es núcleo.',
      fr: 'Voisins ici : {n}. Cela atteint minPts, donc ce point est un cœur.',
      hi: 'यहाँ पड़ोसी: {n}. यह minPts तक पहुँचता है, इसलिए यह बिंदु केंद्र है।',
      id: 'Tetangga di sini: {n}. Itu mencapai minPts, jadi titik ini inti.',
      pt: 'Vizinhos aqui: {n}. Isso alcança minPts, então este ponto é núcleo.',
    },
    'caption.thin': {
      en: 'Neighbours here: {n}. Short of minPts {minPts}.',
      ko: '여기 이웃 수는 {n}. minPts 에 못 미친다 — 필요한 수는 {minPts}.',
      ja: 'ここの隣人は {n}。minPts {minPts} に足りない。',
      zh: '这里的邻居有 {n} 个。不到 minPts {minPts}。',
      ar: 'الجيران هنا: {n}. أقل من minPts {minPts}.',
      es: 'Vecinos aquí: {n}. Por debajo de minPts {minPts}.',
      fr: 'Voisins ici : {n}. En deçà de minPts {minPts}.',
      hi: 'यहाँ पड़ोसी: {n}. minPts {minPts} से कम।',
      id: 'Tetangga di sini: {n}. Kurang dari minPts {minPts}.',
      pt: 'Vizinhos aqui: {n}. Abaixo de minPts {minPts}.',
    },
    'caption.noise': {
      en: 'Too few neighbours — this one is left as noise.',
      ko: '이웃이 모자라 이 점은 잡음으로 남는다.',
      ja: '隣人が少なすぎる — この点はノイズとして残る。',
      zh: '邻居太少 — 这个点被留作噪声。',
      ar: 'الجيران قليلون جدًا — تُترك هذه النقطة ضجيجًا.',
      es: 'Muy pocos vecinos: este queda como ruido.',
      fr: 'Trop peu de voisins — celui-ci reste du bruit.',
      hi: 'बहुत कम पड़ोसी — यह शोर के रूप में छोड़ दिया जाता है।',
      id: 'Tetangganya terlalu sedikit — titik ini ditinggal sebagai derau.',
      pt: 'Vizinhos de menos — este fica como ruído.',
    },
    'caption.opened': {
      en: 'A new group opens here. Groups so far: {n}.',
      ko: '여기서 새 무리가 열린다. 지금까지 무리는 {n}.',
      ja: 'ここで新しいグループが開く。ここまでのグループは {n}。',
      zh: '这里开出一个新组。到目前为止有 {n} 组。',
      ar: 'تُفتح مجموعة جديدة هنا. المجموعات حتى الآن: {n}.',
      es: 'Aquí se abre un grupo nuevo. Grupos hasta ahora: {n}.',
      fr: "Un nouveau groupe s'ouvre ici. Groupes jusqu'ici : {n}.",
      hi: 'यहाँ एक नया समूह खुलता है। अब तक समूह: {n}.',
      id: 'Kelompok baru terbuka di sini. Kelompok sejauh ini: {n}.',
      pt: 'Um novo grupo se abre aqui. Grupos até agora: {n}.',
    },
    'caption.spread': {
      en: 'It catches on the neighbour of a neighbour and goes on the stack.',
      ko: '이웃의 이웃으로 옮아붙어 스택에 쌓인다.',
      ja: '隣人の隣人へ燃え移り、スタックに積まれる。',
      zh: '它蔓延到邻居的邻居，被压入栈中。',
      ar: 'تنتقل إلى جار الجار وتُوضع على المكدس.',
      es: 'Se pega al vecino del vecino y va a la pila.',
      fr: 'Cela gagne le voisin du voisin et passe sur la pile.',
      hi: 'यह पड़ोसी के पड़ोसी तक फैलता है और स्टैक पर चढ़ जाता है।',
      id: 'Ia merambat ke tetangga dari tetangga lalu naik ke tumpukan.',
      pt: 'Pega no vizinho do vizinho e vai para a pilha.',
    },
    'caption.reclaim': {
      en: 'A point once called noise becomes a border and joins the group.',
      ko: '잡음이라 적어 둔 점이 가장자리가 되어 무리에 든다.',
      ja: 'かつてノイズとされた点が縁になり、グループに入る。',
      zh: '曾被判为噪声的点成了边界，加入了这一组。',
      ar: 'نقطة سُمّيت ضجيجًا تصير حدًّا وتنضم إلى المجموعة.',
      es: 'Un punto que se llamó ruido pasa a ser borde y entra al grupo.',
      fr: 'Un point jadis dit bruit devient une bordure et rejoint le groupe.',
      hi: 'जिस बिंदु को शोर कहा गया था वह सीमा बनकर समूह में शामिल हो जाता है।',
      id: 'Titik yang tadi disebut derau menjadi batas dan masuk ke kelompok.',
      pt: 'Um ponto antes chamado de ruído vira borda e entra no grupo.',
    },
    'caption.settled': {
      en: 'eps {eps} with minPts {minPts} — groups {clusters}, noise {noise}.',
      ko: 'eps {eps} 와 minPts {minPts} — 무리 {clusters}, 잡음 {noise}.',
      ja: 'eps {eps}、minPts {minPts} — グループ {clusters}、ノイズ {noise}。',
      zh: 'eps {eps} 配 minPts {minPts} — 组 {clusters}，噪声 {noise}。',
      ar: 'eps {eps} مع minPts {minPts} — المجموعات {clusters}، الضجيج {noise}.',
      es: 'eps {eps} con minPts {minPts}: grupos {clusters}, ruido {noise}.',
      fr: 'eps {eps} avec minPts {minPts} — groupes {clusters}, bruit {noise}.',
      hi: 'eps {eps} और minPts {minPts} — समूह {clusters}, शोर {noise}.',
      id: 'eps {eps} dengan minPts {minPts} — kelompok {clusters}, derau {noise}.',
      pt: 'eps {eps} com minPts {minPts} — grupos {clusters}, ruído {noise}.',
    },
    'label.aria': {
      en: 'DBSCAN — points on a plane, the spreading stack, and a tally of every eps and minPts tried',
      ko: 'DBSCAN — 평면 위의 점, 번짐을 나르는 스택, 그리고 다녀온 eps 와 minPts 의 대조표',
      ja: 'DBSCAN — 平面上の点、広がりを運ぶスタック、そして試した eps と minPts の一覧',
      zh: 'DBSCAN — 平面上的点、承载蔓延的栈，以及试过的每组 eps 与 minPts 的对照表',
      ar: 'DBSCAN — نقاط على مستوٍ، ومكدس الانتشار، وجدول لكل eps وminPts جُرّب',
      es: 'DBSCAN: puntos en un plano, la pila del contagio y un recuento de cada eps y minPts probados',
      fr: 'DBSCAN — des points sur un plan, la pile de propagation et un relevé de chaque eps et minPts essayés',
      hi: 'DBSCAN — समतल पर बिंदु, फैलाव का स्टैक, और आज़माए गए हर eps तथा minPts का लेखा',
      id: 'DBSCAN — titik pada bidang, tumpukan perambatan, dan catatan setiap eps dan minPts yang dicoba',
      pt: 'DBSCAN — pontos num plano, a pilha do alastramento e um registro de cada eps e minPts testados',
    },
    'label.tally': {
      en: 'groups / noise',
      ko: '무리 / 잡음',
      ja: 'グループ / ノイズ',
      zh: '组 / 噪声',
      ar: 'المجموعات / الضجيج',
      es: 'grupos / ruido',
      fr: 'groupes / bruit',
      hi: 'समूह / शोर',
      id: 'kelompok / derau',
      pt: 'grupos / ruído',
    },
    'label.now': {
      en: 'now: eps {eps}, minPts {minPts}',
      ko: '지금: eps {eps}, minPts {minPts}',
      ja: '現在: eps {eps}、minPts {minPts}',
      zh: '当前: eps {eps}，minPts {minPts}',
      ar: 'الآن: eps {eps}، minPts {minPts}',
      es: 'ahora: eps {eps}, minPts {minPts}',
      fr: 'maintenant : eps {eps}, minPts {minPts}',
      hi: 'अभी: eps {eps}, minPts {minPts}',
      id: 'sekarang: eps {eps}, minPts {minPts}',
      pt: 'agora: eps {eps}, minPts {minPts}',
    },
    'legend.core': {
      en: 'core — spreading goes on',
      ko: '핵심점 — 번짐이 이어진다',
      ja: '核 — 広がりが続く',
      zh: '核心 — 蔓延继续',
      ar: 'نواة — الانتشار يستمر',
      es: 'núcleo: el contagio sigue',
      fr: 'cœur — la propagation continue',
      hi: 'केंद्र — फैलाव जारी रहता है',
      id: 'inti — perambatan berlanjut',
      pt: 'núcleo — o alastramento segue',
    },
    'legend.border': {
      en: 'border — spreading stops',
      ko: '가장자리 — 번짐이 멈춘다',
      ja: '縁 — 広がりが止まる',
      zh: '边界 — 蔓延停止',
      ar: 'حد — الانتشار يقف',
      es: 'borde: el contagio se detiene',
      fr: "bordure — la propagation s'arrête",
      hi: 'सीमा — फैलाव रुक जाता है',
      id: 'batas — perambatan berhenti',
      pt: 'borda — o alastramento para',
    },
    'legend.noise': {
      en: 'noise — no group reached',
      ko: '잡음 — 어느 무리도 닿지 못한다',
      ja: 'ノイズ — どのグループも届かない',
      zh: '噪声 — 没有组能到达',
      ar: 'ضجيج — لم تصل إليه أي مجموعة',
      es: 'ruido: ningún grupo lo alcanza',
      fr: "bruit — aucun groupe ne l'atteint",
      hi: 'शोर — कोई समूह नहीं पहुँचा',
      id: 'derau — tak ada kelompok yang sampai',
      pt: 'ruído — nenhum grupo o alcança',
    },
  },
};
