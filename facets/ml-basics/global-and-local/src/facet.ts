/**
 * 전역과 지역 구조 조각 facet JSON 선언.
 *
 * @piece — 질문 하나에 답하고 멈추는 조각 (S-piece).
 *
 * 질문: 편 그림에서 무리 사이가 가까워 보이면 정말 가까운 것인가.
 *
 * 선언이 담는 것은 구조뿐이다 — 세 무리의 좌표와 펴는 법(무리 폭 · 무리 사이
 * 틈). 주성분 축도 · 무리 가운데도 · 사이의 몫도 여기 없다. 전부 파생값이라
 * algorithm 이 좌표에서 셈하고, 자 위의 자리는 stage 가 캔버스에서 역산한다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

/**
 * 세 무리, 각 넷.
 *
 * A 와 B 는 가깝고 C 는 멀리 떨어져 있다. 그 "멀다" 가 편 뒤에도 남는지가
 * 이 조각이 묻는 것이다.
 */
const GROUPS: ReadonlyArray<{
  name: string;
  points: ReadonlyArray<{ id: string; x: number; y: number }>;
}> = [
  {
    name: 'A',
    points: [
      { id: 'a1', x: 1.0, y: 1.0 },
      { id: 'a2', x: 1.6, y: 1.4 },
      { id: 'a3', x: 1.2, y: 1.9 },
      { id: 'a4', x: 1.9, y: 0.9 },
    ],
  },
  {
    name: 'B',
    points: [
      { id: 'b1', x: 4.0, y: 1.2 },
      { id: 'b2', x: 4.7, y: 1.6 },
      { id: 'b3', x: 4.2, y: 2.1 },
      { id: 'b4', x: 4.9, y: 1.0 },
    ],
  },
  {
    name: 'C',
    points: [
      { id: 'c1', x: 13.0, y: 1.1 },
      { id: 'c2', x: 13.7, y: 1.5 },
      { id: 'c3', x: 13.2, y: 2.0 },
      { id: 'c4', x: 13.9, y: 0.9 },
    ],
  },
];

export const globalAndLocalFacet: FacetJson = {
  id: 'facet:globalAndLocal',
  title: {
    en: 'Global and local — two flattenings, side by side',
    ko: '전역과 지역 — 두 가지로 펴서 나란히',
    ja: '大域と局所 — 二通りの平坦化を並べて',
    zh: '全局与局部 — 两种展平并排看',
    ar: 'العام والمحلي — تسطيحان جنبًا إلى جنب',
    es: 'Global y local: dos aplanamientos, uno junto al otro',
    fr: 'Global et local — deux aplatissements, côte à côte',
    hi: 'वैश्विक और स्थानीय — दो चपटीकरण, साथ-साथ',
    id: 'Global dan lokal — dua perataan, berdampingan',
    pt: 'Global e local — dois achatamentos, lado a lado',
  },
  description: {
    en: 'Cluster gaps that look equal may not be equal at all',
    ko: '고르게 벌어져 보이는 무리 사이가 정말 고른 것은 아니다',
    ja: '等間隔に見えるクラスタの隔たりが、実は等間隔とは限らない',
    zh: '看起来一样宽的簇间距，未必真的一样',
    ar: 'الفجوات بين العناقيد التي تبدو متساوية قد لا تكون متساوية إطلاقًا',
    es: 'Las distancias entre grupos que parecen iguales pueden no serlo',
    fr: 'Des écarts entre groupes qui semblent égaux ne le sont pas forcément',
    hi: 'जो क्लस्टर-दूरियाँ बराबर दिखती हैं, ज़रूरी नहीं कि बराबर हों',
    id: 'Jarak antarklaster yang tampak sama belum tentu benar-benar sama',
    pt: 'Distâncias entre grupos que parecem iguais podem não ser',
  },
  algorithm: 'module:globalAndLocal',
  projector: 'module:globalAndLocalProjector',
  initialData: {
    type: 'global-and-local',
    groups: GROUPS.map((g) => ({ name: g.name, points: g.points.map((p) => ({ ...p })) })),
    local: { clusterSpan: 4, clusterGap: 3 },
    stepMs: 850,
  },
  blocks: {
    stage: { type: 'global-and-local-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'label.global': {
      en: 'Keeps the long distances — projected onto the widest direction',
      ko: '큰 거리를 지킨다 — 가장 넓게 퍼진 방향에 내려 찍기',
      ja: '大きな距離を保つ — 最も広がった方向へ射影',
      zh: '保住大距离 — 投影到最宽的方向',
      ar: 'يحفظ المسافات الكبيرة — إسقاط على الاتجاه الأوسع',
      es: 'Conserva las distancias grandes: proyección sobre la dirección más ancha',
      fr: 'Conserve les grandes distances — projection sur la direction la plus étalée',
      hi: 'बड़ी दूरियाँ बचाता है — सबसे चौड़ी दिशा पर प्रक्षेप',
      id: 'Menjaga jarak besar — diproyeksikan ke arah paling lebar',
      pt: 'Preserva as distâncias grandes — projeção na direção mais larga',
    },
    'label.local': {
      en: 'Keeps only the neighbours — order inside a cluster, clusters evenly spaced',
      ko: '이웃만 지킨다 — 무리 안의 차례만 지키고 고르게 늘어놓기',
      ja: '近傍だけ保つ — クラスタ内の順序だけ守り、等間隔に並べる',
      zh: '只保住邻居 — 守住簇内次序，簇间等距排开',
      ar: 'يحفظ الجيران فقط — الترتيب داخل العنقود، والعناقيد متباعدة بالتساوي',
      es: 'Conserva solo los vecinos: el orden dentro de cada grupo, grupos a igual distancia',
      fr: "Ne conserve que les voisins — l'ordre dans un groupe, groupes espacés régulièrement",
      hi: 'सिर्फ़ पड़ोसी बचाता है — क्लस्टर के भीतर का क्रम, और क्लस्टर बराबर दूरी पर',
      id: 'Hanya menjaga tetangga — urutan di dalam klaster, klaster berjarak sama',
      pt: 'Preserva só os vizinhos — a ordem dentro do grupo, grupos igualmente espaçados',
    },
    'label.ratio': {
      en: 'gap ratio 1 : {r}',
      ko: '무리 사이의 비 1 : {r}',
      ja: '隔たりの比 1 : {r}',
      zh: '间距比 1 : {r}',
      ar: 'نسبة الفجوة 1 : {r}',
      es: 'razón de separación 1 : {r}',
      fr: 'rapport des écarts 1 : {r}',
      hi: 'अंतर का अनुपात 1 : {r}',
      id: 'rasio jarak 1 : {r}',
      pt: 'razão das distâncias 1 : {r}',
    },
    'caption.rulers': {
      en: 'The same data, flattened two ways. Two rulers side by side, with the end clusters pinned to the same spots on both.',
      ko: '같은 자료를 두 가지로 편다. 자 둘을 나란히 놓고, 양 끝 무리를 두 자에서 같은 자리에 맞춘다.',
      ja: '同じデータを二通りに平坦化する。定規を二本並べ、両端のクラスタを両方で同じ位置に合わせる。',
      zh: '同一份数据，两种展平方式。两把尺并排，两端的簇在两把尺上对齐同一位置。',
      ar: 'البيانات نفسها، مسطَّحة بطريقتين. مسطرتان جنبًا إلى جنب، والعنقودان الطرفيان مثبَّتان عند الموضع نفسه في كليهما.',
      es: 'Los mismos datos, aplanados de dos maneras. Dos reglas en paralelo, con los grupos de los extremos fijados en el mismo punto en ambas.',
      fr: 'Les mêmes données, aplaties de deux façons. Deux règles côte à côte, les groupes des extrémités fixés au même endroit sur les deux.',
      hi: 'वही डेटा, दो तरह से चपटा किया गया। दो पैमाने साथ-साथ, और दोनों सिरों के क्लस्टर दोनों पर एक ही जगह टिके हुए।',
      id: 'Data yang sama, diratakan dengan dua cara. Dua penggaris berdampingan, klaster di kedua ujung dipatok pada titik yang sama.',
      pt: 'Os mesmos dados, achatados de duas formas. Duas réguas lado a lado, com os grupos das pontas fixados no mesmo ponto em ambas.',
    },
    'caption.spreadGlobal': {
      en: 'Top ruler — every point drops onto the widest direction. The long distances survive.',
      ko: '위 자 — 가장 넓게 퍼진 방향에 하나씩 내려 찍는다. 먼 거리가 그대로 남는다.',
      ja: '上の定規 — すべての点が最も広がった方向へ落ちる。大きな距離はそのまま残る。',
      zh: '上尺 — 每个点都落到最宽的方向上。大距离原样保留。',
      ar: 'المسطرة العليا — كل نقطة تسقط على الاتجاه الأوسع. المسافات الكبيرة تبقى كما هي.',
      es: 'Regla de arriba: cada punto cae sobre la dirección más ancha. Las distancias grandes sobreviven.',
      fr: 'Règle du haut — chaque point tombe sur la direction la plus étalée. Les grandes distances subsistent.',
      hi: 'ऊपर वाला पैमाना — हर बिंदु सबसे चौड़ी दिशा पर गिरता है। बड़ी दूरियाँ बनी रहती हैं।',
      id: 'Penggaris atas — setiap titik jatuh ke arah paling lebar. Jarak besarnya tetap utuh.',
      pt: 'Régua de cima — cada ponto cai sobre a direção mais larga. As distâncias grandes permanecem.',
    },
    'caption.spreadLocal': {
      en: 'Bottom ruler — only the order inside each cluster is kept, and the clusters are laid out at equal steps.',
      ko: '아래 자 — 무리 안의 차례만 지키고, 무리끼리는 같은 간격으로 늘어놓는다.',
      ja: '下の定規 — 各クラスタ内の順序だけを保ち、クラスタは等間隔に並べる。',
      zh: '下尺 — 只保住每个簇内的次序，簇与簇之间等距排列。',
      ar: 'المسطرة السفلى — يُحفظ الترتيب داخل كل عنقود فقط، وتُوزَّع العناقيد بخطوات متساوية.',
      es: 'Regla de abajo: solo se guarda el orden dentro de cada grupo, y los grupos se colocan a pasos iguales.',
      fr: "Règle du bas — seul l'ordre à l'intérieur de chaque groupe est conservé, et les groupes sont disposés à pas égaux.",
      hi: 'नीचे वाला पैमाना — सिर्फ़ हर क्लस्टर के भीतर का क्रम रखा जाता है, और क्लस्टर बराबर अंतराल पर सजाए जाते हैं।',
      id: 'Penggaris bawah — hanya urutan di dalam tiap klaster yang dijaga, dan klaster ditata berjarak sama.',
      pt: 'Régua de baixo — só a ordem dentro de cada grupo é mantida, e os grupos ficam a passos iguais.',
    },
    'caption.tie': {
      en: 'Tie the same items together. Both ends are pinned, so what is left is the middle — it slid by {shift}.',
      ko: '같은 자리끼리 잇는다. 양 끝은 맞춰 두었으니 남는 것은 가운데다. 밀린 폭: {shift}.',
      ja: '同じものどうしを結ぶ。両端は合わせてあるので、残るのは真ん中だ。ずれた幅は {shift}。',
      zh: '把相同的项连起来。两端已经对齐，剩下的就是中间 — 它挪了 {shift}。',
      ar: 'صِل العناصر نفسها ببعضها. الطرفان مثبَّتان، فالمتبقي هو الوسط — وقد انزاح بمقدار {shift}.',
      es: 'Une los mismos elementos. Los dos extremos están fijados, así que lo que queda es el medio: se desplazó {shift}.',
      fr: 'Relie les mêmes éléments. Les deux extrémités sont fixées, il ne reste donc que le milieu — il a glissé de {shift}.',
      hi: 'एक ही वस्तुओं को आपस में जोड़ें। दोनों सिरे टिके हैं, तो बचता है बीच वाला — वह {shift} खिसक गया।',
      id: 'Hubungkan benda yang sama. Kedua ujung sudah dipatok, jadi yang tersisa bagian tengah — ia bergeser {shift}.',
      pt: 'Ligue os mesmos itens. As duas pontas estão fixadas, então resta o meio — ele deslizou {shift}.',
    },
    'caption.inside': {
      en: 'Look inside a cluster — the room one cluster gets is {g} on top and {l} below. Below, the four are readable.',
      ko: '무리 안을 본다. 무리 하나가 차지하는 몫은 위 {g}, 아래 {l}. 아래에서는 넷이 보인다.',
      ja: 'クラスタの中を見る。ひとつのクラスタが占める幅は上が {g}、下が {l}。下では四つが読み取れる。',
      zh: '看看簇的内部 — 一个簇占的宽度，上尺是 {g}，下尺是 {l}。下面这四个看得清。',
      ar: 'انظر داخل العنقود — المساحة التي ينالها عنقود واحد هي {g} في الأعلى و{l} في الأسفل. في الأسفل تُقرأ الأربع بوضوح.',
      es: 'Mira dentro de un grupo: el espacio que ocupa es {g} arriba y {l} abajo. Abajo se distinguen los cuatro.',
      fr: "Regarde à l'intérieur d'un groupe — la place qu'il occupe est de {g} en haut et {l} en bas. En bas, les quatre se lisent.",
      hi: 'क्लस्टर के भीतर देखें — एक क्लस्टर को मिलती जगह ऊपर {g} और नीचे {l} है। नीचे चारों पढ़े जा सकते हैं।',
      id: 'Lihat ke dalam satu klaster — ruang yang didapatnya {g} di atas dan {l} di bawah. Di bawah, keempatnya terbaca.',
      pt: 'Olhe dentro de um grupo — o espaço que ele ocupa é {g} em cima e {l} embaixo. Embaixo, dá para ler os quatro.',
    },
    'caption.gap': {
      en: 'Now the gap between clusters — {from}–{to}. Originally {o} of the whole, top {g}, bottom {l}.',
      ko: '이번에는 무리 사이 — {from}–{to}. 원래는 전체의 {o}, 위 {g}, 아래 {l}.',
      ja: '次はクラスタ間の隔たり — {from}–{to}。もとは全体の {o}、上は {g}、下は {l}。',
      zh: '再看簇之间的间距 — {from}–{to}。原本占整体的 {o}，上尺 {g}，下尺 {l}。',
      ar: 'والآن الفجوة بين العنقودين — {from}–{to}. أصلًا {o} من الكل، وفي الأعلى {g}، وفي الأسفل {l}.',
      es: 'Ahora la separación entre grupos: {from}–{to}. Originalmente {o} del total, arriba {g}, abajo {l}.',
      fr: "Maintenant l'écart entre les groupes — {from}–{to}. À l'origine {o} du total, en haut {g}, en bas {l}.",
      hi: 'अब क्लस्टरों के बीच का अंतर — {from}–{to}। मूल रूप से पूरे का {o}, ऊपर {g}, नीचे {l}।',
      id: 'Sekarang jarak antarklaster — {from}–{to}. Aslinya {o} dari keseluruhan, atas {g}, bawah {l}.',
      pt: 'Agora a distância entre grupos — {from}–{to}. Originalmente {o} do todo, em cima {g}, embaixo {l}.',
    },
    'caption.ratio': {
      en: 'Second gap over first — originally 1 : {o}, top 1 : {g}, bottom 1 : {l}.',
      ko: '뒤 사이를 앞 사이로 나눈 값 — 원래 1 : {o}, 위 1 : {g}, 아래 1 : {l}.',
      ja: '後ろの隔たりを前の隔たりで割る — もとは 1 : {o}、上は 1 : {g}、下は 1 : {l}。',
      zh: '后一段间距除以前一段 — 原本 1 : {o}，上尺 1 : {g}，下尺 1 : {l}。',
      ar: 'الفجوة الثانية على الأولى — أصلًا 1 : {o}، وفي الأعلى 1 : {g}، وفي الأسفل 1 : {l}.',
      es: 'La segunda separación dividida por la primera: originalmente 1 : {o}, arriba 1 : {g}, abajo 1 : {l}.',
      fr: "Le second écart divisé par le premier — à l'origine 1 : {o}, en haut 1 : {g}, en bas 1 : {l}.",
      hi: 'दूसरा अंतर पहले से भाग — मूल में 1 : {o}, ऊपर 1 : {g}, नीचे 1 : {l}।',
      id: 'Jarak kedua dibagi jarak pertama — aslinya 1 : {o}, atas 1 : {g}, bawah 1 : {l}.',
      pt: 'A segunda distância dividida pela primeira — originalmente 1 : {o}, em cima 1 : {g}, embaixo 1 : {l}.',
    },
    'caption.verdict': {
      en: 'Three times apart became the same. Do not read cluster-to-cluster distance off the bottom ruler.',
      ko: '세 배였던 것이 같아졌다. 아래 자에서 무리 사이 거리를 읽으면 안 된다.',
      ja: '三倍だったものが同じになった。下の定規でクラスタ間の距離を読んではいけない。',
      zh: '相差三倍的变成了一样。别在下尺上读簇与簇之间的距离。',
      ar: 'ما كان أبعد بثلاثة أضعاف صار متساويًا. لا تقرأ المسافة بين العناقيد من المسطرة السفلى.',
      es: 'Lo que estaba al triple de distancia quedó igual. No leas la distancia entre grupos en la regla de abajo.',
      fr: 'Ce qui était trois fois plus loin est devenu identique. Ne lis pas la distance entre groupes sur la règle du bas.',
      hi: 'जो तीन गुना दूर था वह बराबर हो गया। नीचे वाले पैमाने से क्लस्टरों की आपसी दूरी मत पढ़ें।',
      id: 'Yang tadinya tiga kali lebih jauh jadi sama. Jangan membaca jarak antarklaster dari penggaris bawah.',
      pt: 'O que estava três vezes mais longe ficou igual. Não leia a distância entre grupos na régua de baixo.',
    },
    'caption.done': {
      en: 'Looking close and being close are not the same thing.',
      ko: '가까워 보이는 것과 가까운 것은 다르다.',
      ja: '近く見えることと、近いことは別だ。',
      zh: '看起来近，和真的近，不是一回事。',
      ar: 'أن يبدو الشيء قريبًا شيء، وأن يكون قريبًا شيء آخر.',
      es: 'Parecer cercano y estar cerca no son lo mismo.',
      fr: "Paraître proche et être proche, ce n'est pas la même chose.",
      hi: 'पास दिखना और पास होना एक बात नहीं है।',
      id: 'Tampak dekat dan benar-benar dekat itu dua hal berbeda.',
      pt: 'Parecer perto e estar perto não são a mesma coisa.',
    },
  },
};
