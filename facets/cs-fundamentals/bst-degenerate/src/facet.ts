/**
 * bst-degenerate — 편향 트리 조각(piece) 선언.
 *
 * @piece 같은 값 여섯 개를 두 순서로 넣는다. 한쪽은 매번 같은 방향으로만
 * 갈 곳이 정해져 아래로 길어지는 줄이 되고, 다른 쪽은 좌우로 번갈아 붙어
 * 옆으로 퍼진다 — 담긴 값은 같은데 모양만, 그래서 찾는 비용만 다르다는
 * 한 가지만 말하고 멈춘다.
 *
 * 제목 블록도 메트릭도 두지 않는다. 제목은 글의 문단이 주고, 조각은 셀 것이
 * 없다 (S-piece). layout 은 stage 와 controls 뿐이라 러너에 맡긴다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const bstDegenerateFacet: FacetJson = {
  id: 'facet:bstDegenerate',
  title: {
    en: 'Grow one way, grow into a line',
    ko: '한쪽으로만 자라면 줄이 된다',
    ja: '片側にだけ伸びれば一本の線になる',
    zh: '只往一边长，就长成一条线',
    ar: 'إن نما إلى جهة واحدة صار خطًّا',
    es: 'Si crece hacia un solo lado, se vuelve una línea',
    fr: "Grandir d'un seul côté, c'est devenir une ligne",
    hi: 'एक ही ओर बढ़े तो एक लकीर बन जाता है',
    id: 'Tumbuh ke satu sisi saja, jadilah sebuah garis',
    pt: 'Crescer para um só lado é virar uma linha',
  },
  description: {
    en: 'Insert the same six values in two different orders and watch one tree become a chain while the other spreads out.',
    ko: '같은 값 여섯 개를 두 순서로 넣어, 한쪽은 사슬이 되고 다른 쪽은 옆으로 퍼지는 것을 본다.',
    ja: '同じ六つの値を二通りの順で入れ、片方が鎖になり、もう片方が横に広がるのを見る。',
    zh: '把同样的六个值按两种顺序插入，看一棵树变成链条，另一棵横向铺开。',
    ar: 'أدخل القيم الست نفسها بترتيبين مختلفين وشاهد شجرة تصير سلسلة والأخرى تتمدّد عرضًا.',
    es: 'Inserta los mismos seis valores en dos órdenes distintos y mira cómo un árbol se vuelve cadena y el otro se extiende a lo ancho.',
    fr: "Insérez les six mêmes valeurs dans deux ordres différents et voyez un arbre devenir une chaîne tandis que l'autre s'étale.",
    hi: 'वही छह मान दो अलग क्रमों में डालें और देखें कि एक पेड़ ज़ंजीर बन जाता है और दूसरा चौड़ाई में फैलता है।',
    id: 'Masukkan enam nilai yang sama dalam dua urutan berbeda, lalu lihat satu pohon jadi rantai dan yang lain melebar.',
    pt: 'Insira os mesmos seis valores em duas ordens diferentes e veja uma árvore virar corrente enquanto a outra se espalha.',
  },
  algorithm: 'module:bstDegenerate',
  projector: 'module:bstDegenerateProjector',
  initialData: {
    type: 'bst-degenerate',
    // 오름차순 — 새 값이 언제나 지금 자리보다 커서 오른쪽으로만 뻗는다.
    orderA: [10, 20, 30, 40, 50, 60],
    // 좌우를 번갈아 골라 옆으로 퍼진다.
    orderB: [40, 20, 60, 10, 30, 50],
    // 두 나무에서 공통으로 찾아볼 값 — 찾을 때 비교 횟수가 곧 높이 차이다.
    searchValue: 60,
    stepMs: 560,
  },
  blocks: {
    stage: { type: 'bst-degenerate-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.problem': {
      en: 'The same six values, inserted in two different orders.',
      ko: '같은 값 여섯 개를 두 순서로 넣는다.',
      ja: '同じ六つの値を、二通りの順で入れる。',
      zh: '同样的六个值，按两种顺序插入。',
      ar: 'القيم الست نفسها، مُدخَلة بترتيبين مختلفين.',
      es: 'Los mismos seis valores, insertados en dos órdenes distintos.',
      fr: 'Les six mêmes valeurs, insérées dans deux ordres différents.',
      hi: 'वही छह मान, दो अलग क्रमों में डाले गए।',
      id: 'Enam nilai yang sama, dimasukkan dalam dua urutan berbeda.',
      pt: 'Os mesmos seis valores, inseridos em duas ordens diferentes.',
    },
    'caption.growing': {
      en: 'Every insertion compares first, then goes left or right.',
      ko: '넣을 때마다 먼저 비교하고, 그 결과로 왼쪽 또는 오른쪽으로 내려간다.',
      ja: '入れるたびにまず比べ、その結果で左か右へ下りる。',
      zh: '每次插入都先比较，再决定往左还是往右。',
      ar: 'كل إدخال يقارن أولًا، ثم يمضي يسارًا أو يمينًا.',
      es: 'Cada inserción compara primero y luego va a la izquierda o a la derecha.',
      fr: "Chaque insertion compare d'abord, puis descend à gauche ou à droite.",
      hi: 'हर बार डालते समय पहले तुलना होती है, फिर बाएँ या दाएँ जाया जाता है।',
      id: 'Setiap penyisipan membandingkan dulu, baru turun ke kiri atau ke kanan.',
      pt: 'Cada inserção compara primeiro e depois desce à esquerda ou à direita.',
    },
    'caption.searching': {
      en: 'Both trees are built. Now look for {value} in each.',
      ko: '두 나무를 다 길렀다. 이제 각각에서 {value} 을 찾아본다.',
      ja: '木が二つとも育った。ここで両方から {value} を探す。',
      zh: '两棵树都建好了。现在各自去找 {value}。',
      ar: 'اكتملت الشجرتان. الآن ابحث عن {value} في كل منهما.',
      es: 'Los dos árboles están listos. Ahora busca {value} en cada uno.',
      fr: 'Les deux arbres sont construits. Cherchons {value} dans chacun.',
      hi: 'दोनों पेड़ बन गए। अब हर एक में {value} खोजें।',
      id: 'Kedua pohon sudah jadi. Sekarang cari {value} di masing-masing.',
      pt: 'As duas árvores estão prontas. Agora procure {value} em cada uma.',
    },
    'caption.result': {
      en: 'A: height {heightA}, {comparisonsA} compares. B: height {heightB}, {comparisonsB} compares — same values, different cost.',
      ko: 'A: 높이 {heightA}, 비교 {comparisonsA}회. B: 높이 {heightB}, 비교 {comparisonsB}회 — 같은 값인데 비용이 다르다.',
      ja: 'A: 高さ {heightA}、比較 {comparisonsA} 回。B: 高さ {heightB}、比較 {comparisonsB} 回 — 同じ値なのに費用が違う。',
      zh: 'A：高 {heightA}，比较 {comparisonsA} 次。B：高 {heightB}，比较 {comparisonsB} 次 — 值相同，代价不同。',
      ar: 'أ: الارتفاع {heightA} و{comparisonsA} مقارنة. ب: الارتفاع {heightB} و{comparisonsB} مقارنة — القيم نفسها والتكلفة مختلفة.',
      es: 'A: altura {heightA}, {comparisonsA} comparaciones. B: altura {heightB}, {comparisonsB} comparaciones: mismos valores, distinto coste.',
      fr: 'A : hauteur {heightA}, {comparisonsA} comparaisons. B : hauteur {heightB}, {comparisonsB} comparaisons — mêmes valeurs, coût différent.',
      hi: 'A: ऊँचाई {heightA}, {comparisonsA} तुलनाएँ। B: ऊँचाई {heightB}, {comparisonsB} तुलनाएँ — मान वही, लागत अलग।',
      id: 'A: tinggi {heightA}, {comparisonsA} perbandingan. B: tinggi {heightB}, {comparisonsB} perbandingan — nilai sama, biaya berbeda.',
      pt: 'A: altura {heightA}, {comparisonsA} comparações. B: altura {heightB}, {comparisonsB} comparações — mesmos valores, custo diferente.',
    },
    'label.result': {
      en: 'height {height} · {comparisons} compares',
      ko: '높이 {height} · 비교 {comparisons}회',
      ja: '高さ {height} · 比較 {comparisons} 回',
      zh: '高 {height} · 比较 {comparisons} 次',
      ar: 'الارتفاع {height} · {comparisons} مقارنة',
      es: 'altura {height} · {comparisons} comparaciones',
      fr: 'hauteur {height} · {comparisons} comparaisons',
      hi: 'ऊँचाई {height} · {comparisons} तुलनाएँ',
      id: 'tinggi {height} · {comparisons} perbandingan',
      pt: 'altura {height} · {comparisons} comparações',
    },
  },
};
