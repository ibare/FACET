/**
 * @piece 순회 순서 — "어느 순서로 밟는가".
 *
 * 답하는 질문 하나: **같은 나무를 세 가지 차례로 훑을 때 무엇이 달라지는가.**
 * 나무도 발이 지나는 길도 바뀌지 않는다. 제 자리를 밟았다고 세는 순간만
 * 자식보다 먼저 / 왼쪽 다음 / 둘 다 마친 뒤로 옮겨 간다.
 *
 * 조각이므로 header · metrics · layout 을 두지 않는다 (S-piece).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const traversalOrderFacet: FacetJson = {
  id: 'facet:traversalOrder',
  title: {
    en: 'Traversal order',
    ko: '순회 순서',
    ja: '巡回の順序',
    zh: '遍历顺序',
    ar: 'ترتيب الاجتياز',
    es: 'Orden de recorrido',
    fr: 'Ordre de parcours',
    hi: 'ट्रैवर्सल क्रम',
    id: 'Urutan penelusuran',
    pt: 'Ordem de percurso',
  },
  description: {
    en: 'One tree walked three ways. Only the moment of stepping on its own place moves.',
    ko: '한 나무를 세 가지 차례로 밟는다. 제 자리를 밟는 순간만 옮겨 간다.',
    ja: '一本の木を三通りに歩く。自分の場所を踏む瞬間だけがずれる。',
    zh: '同一棵树走三种顺序。只有踩到自己位置的时刻在移动。',
    ar: 'شجرة واحدة نمشيها بثلاث طرق. لا يتغيّر سوى لحظة الوقوف على مكانها.',
    es: 'Un mismo árbol recorrido de tres formas. Solo cambia el momento de pisar el propio lugar.',
    fr: "Un même arbre parcouru de trois façons. Seul bouge le moment où l'on pose le pied sur sa propre place.",
    hi: 'एक ही पेड़, तीन तरह से चला गया। बस अपनी जगह पर पैर रखने का क्षण बदलता है।',
    id: 'Satu pohon ditelusuri tiga cara. Hanya saat menginjak tempatnya sendiri yang bergeser.',
    pt: 'Uma mesma árvore percorrida de três modos. Só muda o momento de pisar no próprio lugar.',
  },
  algorithm: 'module:traversalOrder',
  projector: 'module:traversalOrderProjector',
  initialData: {
    type: 'traversal-order',
    // 값이 곧 이름인 이진 탐색 트리. 레벨 순서로 적었다.
    //         4
    //       /   \
    //      2     6
    //     / \   / \
    //    1   3 5   7
    values: [4, 2, 6, 1, 3, 5, 7],
    orders: ['pre', 'in', 'post'],
    stepMs: 480,
  },
  blocks: {
    stage: { type: 'traversal-order-stage' },
    // 조각의 표준 묶음 — 다시 보기 · 한 걸음 (S-piece).
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'label.preorder': {
      en: 'preorder',
      ko: '전위',
      ja: '行きがけ順',
      zh: '前序',
      ar: 'سابق',
      es: 'preorden',
      fr: 'préfixe',
      hi: 'पूर्वक्रम',
      id: 'preorder',
      pt: 'pré-ordem',
    },
    'label.inorder': {
      en: 'inorder',
      ko: '중위',
      ja: '通りがけ順',
      zh: '中序',
      ar: 'وسطي',
      es: 'inorden',
      fr: 'infixe',
      hi: 'मध्यक्रम',
      id: 'inorder',
      pt: 'em-ordem',
    },
    'label.postorder': {
      en: 'postorder',
      ko: '후위',
      ja: '帰りがけ順',
      zh: '后序',
      ar: 'لاحق',
      es: 'postorden',
      fr: 'suffixe',
      hi: 'पश्चक्रम',
      id: 'postorder',
      pt: 'pós-ordem',
    },
    'caption.pre': {
      en: 'Preorder — step on your own place first, then left, then right.',
      ko: '전위 — 제 자리를 먼저 밟고, 그다음 왼쪽, 그다음 오른쪽.',
      ja: '行きがけ順 — まず自分の場所を踏み、次に左、それから右。',
      zh: '前序 — 先踩自己的位置，再左，再右。',
      ar: 'الترتيب السابق — طأ مكانك أولًا، ثم اليسار، ثم اليمين.',
      es: 'Preorden: primero el propio lugar, luego la izquierda, luego la derecha.',
      fr: "Parcours préfixe — sa propre place d'abord, puis à gauche, puis à droite.",
      hi: 'पूर्वक्रम — पहले अपनी जगह, फिर बाएँ, फिर दाएँ।',
      id: 'Preorder — injak tempat sendiri dulu, lalu kiri, lalu kanan.',
      pt: 'Pré-ordem — primeiro o próprio lugar, depois a esquerda, depois a direita.',
    },
    'caption.in': {
      en: 'Inorder — left first, then your own place, then right.',
      ko: '중위 — 왼쪽을 마친 뒤에 제 자리, 그다음 오른쪽.',
      ja: '通りがけ順 — 左を先に、次に自分の場所、それから右。',
      zh: '中序 — 先左，再踩自己的位置，再右。',
      ar: 'الترتيب الوسطي — اليسار أولًا، ثم مكانك، ثم اليمين.',
      es: 'Inorden: primero la izquierda, luego el propio lugar, luego la derecha.',
      fr: "Parcours infixe — à gauche d'abord, puis sa propre place, puis à droite.",
      hi: 'मध्यक्रम — पहले बाएँ, फिर अपनी जगह, फिर दाएँ।',
      id: 'Inorder — kiri dulu, lalu tempat sendiri, lalu kanan.',
      pt: 'Em-ordem — primeiro a esquerda, depois o próprio lugar, depois a direita.',
    },
    'caption.post': {
      en: 'Postorder — both children first, then your own place.',
      ko: '후위 — 왼쪽과 오른쪽을 다 마친 뒤에 제 자리.',
      ja: '帰りがけ順 — 左右の子を終えてから、自分の場所。',
      zh: '后序 — 两个子节点都走完，再踩自己的位置。',
      ar: 'الترتيب اللاحق — كلا الابنين أولًا، ثم مكانك.',
      es: 'Postorden: primero los dos hijos, luego el propio lugar.',
      fr: "Parcours suffixe — les deux enfants d'abord, puis sa propre place.",
      hi: 'पश्चक्रम — पहले दोनों संतानें, फिर अपनी जगह।',
      id: 'Postorder — kedua anak dulu, baru tempat sendiri.',
      pt: 'Pós-ordem — primeiro os dois filhos, depois o próprio lugar.',
    },
    'caption.done': {
      en: 'Same tree, same route. Only the moment of stepping on its own place moves.',
      ko: '같은 나무, 같은 길. 제 자리를 밟는 순간만 옮겨 간다.',
      ja: '同じ木、同じ道。自分の場所を踏む瞬間だけがずれる。',
      zh: '同一棵树，同一条路。只有踩到自己位置的时刻在移动。',
      ar: 'الشجرة نفسها والمسار نفسه. لا يتغيّر سوى لحظة الوقوف على مكانها.',
      es: 'El mismo árbol, el mismo recorrido. Solo cambia el momento de pisar el propio lugar.',
      fr: "Même arbre, même chemin. Seul bouge le moment où l'on pose le pied sur sa propre place.",
      hi: 'वही पेड़, वही रास्ता। बस अपनी जगह पर पैर रखने का क्षण बदलता है।',
      id: 'Pohon yang sama, jalur yang sama. Hanya saat menginjak tempatnya sendiri yang bergeser.',
      pt: 'Mesma árvore, mesmo caminho. Só muda o momento de pisar no próprio lugar.',
    },
  },
};
