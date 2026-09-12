import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

/**
 * @piece 각도로 재는 닮음 — 길이를 빼고 방향만 견준다.
 *
 * 질의에서 뻗은 화살과 후보들 사이에서 각이 벌어지는 것을 보이고, 그 각이 순위를
 * 정한다는 것 하나만 말한다. 같은 네 점을 유클리드 거리로 재면 순위가 뒤집힌다.
 *
 * `initialData` 에 있는 것은 **점 넷의 정수 좌표**뿐이다. 길이 · 코사인 · 각 ·
 * 거리는 algorithm 이 셈하고, 어디에 무엇을 놓을지는 stage 가 캔버스에서 역산한다
 * (S-piece). 좌표는 동률이 없고 두 자의 1등이 서로 다르도록 고른 것이라, 값을
 * 바꾸면 이 조각이 하는 말이 깨진다.
 */
export const angleNotLengthFacet: FacetJson = {
  id: 'facet:angleNotLength',
  title: {
    en: 'Angle, Not Length',
    ko: '길이가 아니라 각',
    ja: '長さではなく角度',
    zh: '比的是角度，不是长度',
    ar: 'الزاوية لا الطول',
    es: 'El ángulo, no la longitud',
    fr: "L'angle, pas la longueur",
    hi: 'लंबाई नहीं, कोण',
    id: 'Sudut, Bukan Panjang',
    pt: 'O ângulo, não o comprimento',
  },
  description: {
    en: 'Cosine similarity compares directions: the angle sets the ranking and length is left out, so it can disagree with Euclidean distance.',
    ko: '코사인 유사도는 방향을 견준다. 순위를 정하는 것은 각이고 길이는 빠지므로, 유클리드 거리와 순위가 어긋날 수 있다.',
    ja: 'コサイン類似度は方向を比べる。順位を決めるのは角度で長さは外れるため、ユークリッド距離と食い違うことがある。',
    zh: '余弦相似度比较的是方向：角度决定排名，长度被排除在外，因此可能与欧氏距离相反。',
    ar: 'يقارن تشابه جيب التمام الاتجاهات: الزاوية هي التي ترتّب المرشحين والطول يُستبعد، لذا قد يخالف مسافة إقليدس.',
    es: 'La similitud del coseno compara direcciones: el ángulo fija el orden y la longitud queda fuera, así que puede contradecir a la distancia euclidiana.',
    fr: "La similarité cosinus compare des directions : l'angle fixe le classement et la longueur est écartée, si bien qu'elle peut contredire la distance euclidienne.",
    hi: 'कोसाइन समानता दिशाओं की तुलना करती है: क्रम कोण तय करता है और लंबाई बाहर रह जाती है, इसलिए यह यूक्लिडियन दूरी से भिन्न हो सकती है।',
    id: 'Kemiripan kosinus membandingkan arah: sudutlah yang menentukan peringkat dan panjang ditinggalkan, sehingga bisa berbeda dengan jarak Euclidean.',
    pt: 'A similaridade do cosseno compara direções: o ângulo define a classificação e o comprimento fica de fora, podendo contradizer a distância euclidiana.',
  },
  algorithm: 'module:angleNotLength',
  projector: 'module:angleNotLengthProjector',
  initialData: {
    type: 'angle-not-length',
    stepMs: 850,
    query: { id: 'q', x: 3, y: 1 },
    candidates: [
      { id: 'A', x: 1, y: 1 },
      { id: 'B', x: 1, y: 7 },
      { id: 'C', x: 8, y: 5 },
    ],
  },
  blocks: {
    stage: { type: 'angle-not-length-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.place': {
      en: 'Query q and three candidates from the origin.',
      ko: '원점에서 뻗은 질의 q 와 후보 셋.',
      ja: '原点から伸びるクエリ q と三つの候補。',
      zh: '从原点出发的查询 q 与三个候选。',
      ar: 'الاستعلام q وثلاثة مرشحين من نقطة الأصل.',
      es: 'La consulta q y tres candidatos desde el origen.',
      fr: "La requête q et trois candidats depuis l'origine.",
      hi: 'मूल बिंदु से प्रश्न q और तीन उम्मीदवार।',
      id: 'Kueri q dan tiga kandidat dari titik asal.',
      pt: 'A consulta q e três candidatos a partir da origem.',
    },
    'caption.lengths': {
      en: 'Their lengths are far apart.',
      ko: '화살의 길이는 서로 크게 다르다.',
      ja: '矢の長さは大きく違う。',
      zh: '它们的长度相差很大。',
      ar: 'أطوالها متباعدة جدًا.',
      es: 'Sus longitudes son muy distintas.',
      fr: 'Leurs longueurs sont très différentes.',
      hi: 'इनकी लंबाई बहुत अलग है।',
      id: 'Panjangnya berbeda jauh.',
      pt: 'Seus comprimentos são bem diferentes.',
    },
    'caption.sweep': {
      en: 'q to {id} — the angle opens to {deg}°.',
      ko: 'q 에서 {id} 까지 — 벌어진 각: {deg}°',
      ja: 'q から {id} へ — 開いた角: {deg}°',
      zh: '从 q 到 {id} — 张开的角: {deg}°',
      ar: 'من q إلى {id} — تنفرج الزاوية إلى {deg}°',
      es: 'De q a {id}: el ángulo se abre a {deg}°.',
      fr: "De q à {id} : l'angle s'ouvre à {deg}°.",
      hi: 'q से {id} तक — खुला कोण: {deg}°',
      id: 'Dari q ke {id} — sudut membuka ke {deg}°.',
      pt: 'De q a {id}: o ângulo abre para {deg}°.',
    },
    'caption.angleRank': {
      en: 'By angle: {order}. Narrower means more alike.',
      ko: '각으로 매긴 순서: {order}. 좁을수록 닮았다.',
      ja: '角度で並べた順: {order}。狭いほど似ている。',
      zh: '按角度的次序: {order}。越窄越相似。',
      ar: 'حسب الزاوية: {order}. كلما ضاقت زاد التشابه.',
      es: 'Por ángulo: {order}. Más estrecho, más parecido.',
      fr: 'Par angle : {order}. Plus étroit, plus proche.',
      hi: 'कोण से क्रम: {order}। जितना सँकरा, उतना समान।',
      id: 'Menurut sudut: {order}. Makin sempit, makin mirip.',
      pt: 'Por ângulo: {order}. Mais estreito, mais parecido.',
    },
    'caption.chords': {
      en: 'Now the straight-line gap between the tips.',
      ko: '이번에는 끝점 사이의 직선 거리.',
      ja: '今度は先端どうしの直線距離。',
      zh: '这次是端点之间的直线距离。',
      ar: 'الآن المسافة المستقيمة بين الأطراف.',
      es: 'Ahora la distancia en línea recta entre las puntas.',
      fr: "Maintenant l'écart en ligne droite entre les pointes.",
      hi: 'अब सिरों के बीच की सीधी दूरी।',
      id: 'Sekarang jarak garis lurus antar ujung.',
      pt: 'Agora a distância em linha reta entre as pontas.',
    },
    'caption.distRank': {
      en: 'By distance: {order}.',
      ko: '거리로 매긴 순서: {order}.',
      ja: '距離で並べた順: {order}。',
      zh: '按距离的次序: {order}。',
      ar: 'حسب المسافة: {order}.',
      es: 'Por distancia: {order}.',
      fr: 'Par distance : {order}.',
      hi: 'दूरी से क्रम: {order}।',
      id: 'Menurut jarak: {order}.',
      pt: 'Por distância: {order}.',
    },
    'caption.flip': {
      en: '{id}: first by angle, last by distance.',
      ko: '각으로는 1등, 거리로는 꼴찌 — {id}.',
      ja: '角度では1位、距離では最下位 — {id}。',
      zh: '按角度第一，按距离最后 — {id}。',
      ar: 'الأول بالزاوية والأخير بالمسافة — {id}.',
      es: '{id}: primero por ángulo, último por distancia.',
      fr: '{id} : premier par l\'angle, dernier par la distance.',
      hi: 'कोण से पहला, दूरी से आखिरी — {id}।',
      id: 'Pertama menurut sudut, terakhir menurut jarak — {id}.',
      pt: '{id}: primeiro por ângulo, último por distância.',
    },
  },
};
