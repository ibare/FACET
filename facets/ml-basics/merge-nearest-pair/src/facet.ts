/**
 * mergeNearestPair — 병합 군집화. 가장 가까운 둘을 합쳐 올라간다.
 *
 * 무리 수를 미리 정하지 않는다. 저 혼자 한 무리인 채로 시작해 가장 가까운 둘을
 * 합치고, 합친 자리를 그 거리만큼의 높이에 걸어 둔다. 하나가 남을 때까지.
 * 그래서 올라간 높이가 곧 "얼마나 먼 것들을 합쳤는가" 다. 이 조각이 말하는 것은
 * 나무를 짓는 데까지이고, 그 나무를 어디서 자를지는 다른 조각의 몫이다.
 *
 * 선언에 두는 것은 점과 걸음 간격뿐이다. 자리·축척·자의 눈금은 stage 가
 * 캔버스에서 역산한다 (S-piece).
 *
 * @piece
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const mergeNearestPairFacet: FacetJson = {
  id: 'facet:mergeNearestPair',
  title: {
    en: 'Can you cluster without fixing the number first',
    ko: '무리 수를 미리 정하지 않고도 무리를 만들 수 있는가',
    ja: '個数を先に決めずにクラスタリングできるか',
    zh: '不先定好数目，能不能聚类',
    ar: 'هل يمكن التجميع دون تحديد العدد أولًا',
    es: '¿Se puede agrupar sin fijar antes el número?',
    fr: "Peut-on regrouper sans fixer le nombre à l'avance",
    hi: 'क्या पहले संख्या तय किए बिना क्लस्टर बन सकते हैं',
    id: 'Bisakah mengelompokkan tanpa menetapkan jumlahnya dulu',
    pt: 'Dá para agrupar sem fixar antes o número',
  },
  description: {
    en: 'Merge the closest two and hang the joint at the height of that gap. The tree that grows out of it says how far apart everything was.',
    ko: '가장 가까운 둘을 합쳐 그 거리만큼의 높이에 걸어 둔다. 그렇게 자란 나무의 높이가 곧 얼마나 먼 것들을 합쳤는가를 말한다.',
    ja: '最も近い二つを合わせ、その距離の高さに継ぎ目を吊る。そうして育つ木の高さが、どれだけ離れたものを合わせたかを語る。',
    zh: '把最近的两个合并，并把接点挂在这段距离的高度上。长出来的那棵树，说的就是它们原本相隔多远。',
    ar: 'ادمج الأقرب اثنين وعلّق الوصلة على ارتفاع تلك المسافة. الشجرة التي تنمو من ذلك تقول كم كان كل شيء متباعدًا.',
    es: 'Une los dos más cercanos y cuelga la unión a la altura de esa distancia. El árbol que crece de ahí dice cuán lejos estaba todo.',
    fr: "Fusionne les deux plus proches et suspends la jointure à la hauteur de cet écart. L'arbre qui en pousse dit à quel point tout était éloigné.",
    hi: 'सबसे नज़दीकी दो को मिलाओ और जोड़ को उसी दूरी की ऊँचाई पर टाँग दो। जो वृक्ष उगता है वही बताता है कि सब कितना दूर था।',
    id: 'Gabungkan dua yang terdekat dan gantungkan sambungannya pada tinggi jarak itu. Pohon yang tumbuh dari situ menceritakan seberapa jauh semuanya terpisah.',
    pt: 'Junte os dois mais próximos e pendure a junção na altura dessa distância. A árvore que cresce daí diz o quanto tudo estava afastado.',
  },
  algorithm: 'module:mergeNearestPair',
  projector: 'module:mergeNearestPairProjector',
  initialData: {
    type: 'merge-nearest-pair',
    // 세 무리와 외톨이 하나. h 가 끝에서 두 번째에야 붙는 것이 이 배치의 요점이다.
    points: [
      { id: 'a', x: 1.0, y: 1.0 },
      { id: 'b', x: 1.55, y: 1.2 },
      { id: 'c', x: 2.4, y: 1.7 },
      { id: 'd', x: 5.2, y: 1.0 },
      { id: 'e', x: 5.9, y: 1.5 },
      { id: 'f', x: 3.0, y: 5.4 },
      { id: 'g', x: 3.8, y: 5.9 },
      { id: 'h', x: 7.5, y: 6.2 },
    ],
    stepMs: 850,
  },
  blocks: {
    stage: { type: 'merge-nearest-pair-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'label.axis': {
      en: 'height = distance',
      ko: '높이 = 거리',
      ja: '高さ = 距離',
      zh: '高度 = 距离',
      ar: 'الارتفاع = المسافة',
      es: 'altura = distancia',
      fr: 'hauteur = distance',
      hi: 'ऊँचाई = दूरी',
      id: 'tinggi = jarak',
      pt: 'altura = distância',
    },
    'label.remaining': {
      en: 'clusters left',
      ko: '남은 무리',
      ja: '残りのクラスタ',
      zh: '剩余簇数',
      ar: 'العناقيد المتبقية',
      es: 'grupos restantes',
      fr: 'groupes restants',
      hi: 'शेष समूह',
      id: 'kelompok tersisa',
      pt: 'grupos restantes',
    },
    'caption.start': {
      en: 'Eight points, and each is a cluster of its own.',
      ko: '점 여덟, 저마다 한 무리다.',
      ja: '点は八つ、それぞれが一つのクラスタだ。',
      zh: '八个点，各自成一簇。',
      ar: 'ثماني نقاط، كلٌّ منها عنقود بذاته.',
      es: 'Ocho puntos, y cada uno es un grupo por sí solo.',
      fr: 'Huit points, et chacun forme son propre groupe.',
      hi: 'आठ बिंदु, हर एक अपने आप में एक समूह।',
      id: 'Delapan titik, masing-masing kelompoknya sendiri.',
      pt: 'Oito pontos, e cada um é um grupo por si.',
    },
    'caption.merge': {
      en: 'The nearest two join, and the joint hangs at the height of that gap. Height: {d}',
      ko: '가장 가까운 둘을 합쳐 그 사이만큼 올려 건다. 걸린 높이: {d}',
      ja: '最も近い二つが合わさり、継ぎ目がその隔たりの高さに吊られる。高さ: {d}',
      zh: '最近的两个合并，接点挂在这段距离的高度上。高度: {d}',
      ar: 'يلتقي الأقربان، وتُعلَّق الوصلة على ارتفاع تلك المسافة. الارتفاع: {d}',
      es: 'Se unen los dos más cercanos y la unión cuelga a la altura de esa distancia. Altura: {d}',
      fr: 'Les deux plus proches se rejoignent, et la jointure pend à la hauteur de cet écart. Hauteur : {d}',
      hi: 'सबसे नज़दीकी दो जुड़ते हैं, और जोड़ उसी दूरी की ऊँचाई पर टँग जाता है। ऊँचाई: {d}',
      id: 'Dua yang terdekat menyatu, dan sambungannya tergantung pada tinggi jarak itu. Tinggi: {d}',
      pt: 'Os dois mais próximos se juntam, e a junção pende na altura dessa distância. Altura: {d}',
    },
    'caption.done': {
      en: 'Four bars huddle low, three leap high — the height is how far apart they were.',
      ko: '넷은 바닥에 몰리고 셋은 훌쩍 뛴다. 높이가 곧 얼마나 먼 것들을 합쳤는가다.',
      ja: '四つは低く固まり、三つは高く跳ぶ — 高さがそのまま隔たりの大きさだ。',
      zh: '四条挤在低处，三条跃到高处 — 高度就是它们相隔多远。',
      ar: 'أربعة أعمدة تتكدّس في الأسفل وثلاثة تقفز عاليًا — الارتفاع هو مقدار التباعد.',
      es: 'Cuatro barras se apiñan abajo y tres saltan alto: la altura es cuán lejos estaban.',
      fr: 'Quatre barres se serrent en bas, trois bondissent haut — la hauteur dit à quel point elles étaient éloignées.',
      hi: 'चार पट्टियाँ नीचे सिमटी हैं, तीन ऊपर छलाँग लगाती हैं — ऊँचाई ही बताती है कि वे कितनी दूर थीं।',
      id: 'Empat batang berkerumun rendah, tiga melompat tinggi — tingginya itulah seberapa jauh jaraknya.',
      pt: 'Quatro barras se juntam embaixo, três saltam alto — a altura é o quanto estavam afastados.',
    },
  },
};
