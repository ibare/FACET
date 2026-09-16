import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

/**
 * @piece 두 낱말을 같게 만드는 데 드는 최소 손질은, 작은 답들이 모여 만들어진다.
 *
 * 답하는 질문 하나: **한 칸의 값은 어디에서 오는가.** 위 · 왼쪽 · 왼쪽 위, 이미
 * 채운 이웃 셋에서 온다. 그래서 구석에서 시작한 값이 오른쪽 아래로 번져 나가고,
 * 마지막 칸 하나가 두 낱말 전체의 답이 된다.
 *
 * 되짚어 어느 손질을 골랐는지 찾는 일은 이 조각이 말하지 않는다.
 *
 * 화면은 장면(Scene) 방식이라 `projector` 대신 `scene` 을 선언한다. 어느 걸음의
 * 화면이든 셈으로 얻으므로 컨트롤은 `CONTROL_SET.pieceScrub` — 한 걸음씩 미는
 * 단추 대신 끌어 볼 수 있는 띠다 (S-piece 의 화면 방식 표).
 */
export const editTableFillFacet: FacetJson = {
  id: 'facet:editTableFill',
  title: {
    en: 'Filling the edit table',
    ko: '편집 표를 채운다',
    ja: '編集表を埋める',
    zh: '填满编辑表',
    ar: 'ملء جدول التحرير',
    es: 'Rellenar la tabla de edición',
    fr: 'Remplir la table d’édition',
    hi: 'संपादन तालिका भरना',
    id: 'Mengisi tabel penyuntingan',
    pt: 'Preencher a tabela de edição',
  },
  description: {
    en: 'Every cell holds the edit distance of two prefixes, and each one is built from three neighbours that are already filled.',
    ko: '표의 한 칸은 두 앞자락 사이의 최소 손질 수이고, 이미 채워진 이웃 셋에서 만들어진다.',
    ja: '表の各マスは二つの接頭辞の編集距離であり、すでに埋まった三つの隣から作られる。',
    zh: '表中每格是两个前缀之间的编辑距离，由已经填好的三个相邻格算出。',
    ar: 'كل خانة في الجدول هي مسافة التحرير بين بادئتين، وتُبنى من ثلاث خانات مجاورة مملوءة سلفًا.',
    es: 'Cada celda guarda la distancia de edición de dos prefijos y se construye a partir de tres vecinas ya rellenas.',
    fr: 'Chaque case contient la distance d’édition de deux préfixes et se construit à partir de trois voisines déjà remplies.',
    hi: 'तालिका का हर खाना दो उपसर्गों की संपादन दूरी है और पहले से भरे तीन पड़ोसी खानों से बनता है।',
    id: 'Setiap sel menyimpan jarak penyuntingan dua awalan dan dibangun dari tiga sel tetangga yang sudah terisi.',
    pt: 'Cada célula guarda a distância de edição de dois prefixos e é construída a partir de três vizinhas já preenchidas.',
  },
  algorithm: 'module:editTableFill',
  scene: 'module:editTableFillScene',
  initialData: {
    type: 'edit-table-fill',
    source: 'kitten',
    target: 'sitting',
    stepMs: 620,
  },
  blocks: {
    stage: { type: 'edit-table-fill-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
  messages: {
    'caption.corner': {
      en: 'Empty into empty: the corner starts at 0.',
      ko: '빈 것에서 빈 것으로 — 구석은 0.',
      ja: '空から空へ。左上の角は 0。',
      zh: '从空到空：左上角为 0。',
      ar: 'من الفراغ إلى الفراغ: تبدأ الزاوية من 0.',
      es: 'De vacío a vacío: la esquina empieza en 0.',
      fr: 'Du vide au vide : le coin part de 0.',
      hi: 'खाली से खाली: कोने का मान 0.',
      id: 'Dari kosong ke kosong: sudut dimulai dari 0.',
      pt: 'De vazio para vazio: o canto começa em 0.',
    },
    'caption.edges': {
      en: 'Along the edges each letter costs one insert or one delete.',
      ko: '가장자리에서는 글자마다 넣기 하나 또는 지우기 하나가 든다.',
      ja: '縁では文字ごとに挿入ひとつ、または削除ひとつがかかる。',
      zh: '沿着边缘，每个字母花费一次插入或一次删除。',
      ar: 'على الحواف يكلّف كل حرف إدراجًا واحدًا أو حذفًا واحدًا.',
      es: 'En los bordes cada letra cuesta una inserción o un borrado.',
      fr: 'Sur les bords, chaque lettre coûte une insertion ou une suppression.',
      hi: 'किनारों पर हर अक्षर की कीमत एक जोड़ या एक हटाव है।',
      id: 'Di tepi, setiap huruf berharga satu penyisipan atau satu penghapusan.',
      pt: 'Nas bordas cada letra custa uma inserção ou uma remoção.',
    },
    'caption.spread': {
      en: 'Each cell takes the cheapest of three neighbours already filled.',
      ko: '칸마다 이미 채워진 이웃 셋 가운데 가장 싼 것을 고른다.',
      ja: 'どのマスも、すでに埋まった三つの隣から最も安いものを選ぶ。',
      zh: '每格都从已经填好的三个相邻格中取最便宜的一个。',
      ar: 'تأخذ كل خانة أرخص الخيارات من ثلاث خانات مجاورة مملوءة.',
      es: 'Cada celda toma la más barata de tres vecinas ya rellenas.',
      fr: 'Chaque case prend la moins chère de trois voisines déjà remplies.',
      hi: 'हर खाना पहले से भरे तीन पड़ोसियों में से सबसे सस्ता चुनता है।',
      id: 'Setiap sel mengambil yang termurah dari tiga tetangga yang sudah terisi.',
      pt: 'Cada célula toma a mais barata de três vizinhas já preenchidas.',
    },
    'caption.answer': {
      en: 'The last cell answers for the whole pair: {n}.',
      ko: '마지막 칸이 두 낱말 전체의 답이다: {n}.',
      ja: '最後のマスが二つの語全体の答え: {n}。',
      zh: '最后一格就是两个词的答案：{n}。',
      ar: 'الخانة الأخيرة هي جواب الكلمتين كاملتين: {n}.',
      es: 'La última celda responde por el par completo: {n}.',
      fr: 'La dernière case répond pour la paire entière : {n}.',
      hi: 'आख़िरी खाना पूरे जोड़े का उत्तर देता है: {n}.',
      id: 'Sel terakhir menjawab untuk seluruh pasangan: {n}.',
      pt: 'A última célula responde pelo par inteiro: {n}.',
    },
  },
};
