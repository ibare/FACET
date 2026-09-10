/**
 * BstInorderSorted facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "이진 탐색 트리를 중위로 밟으면 왜 정렬되어 나오는가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 하나) / 제목 없음 / 한 주장 /
 * 메트릭 없음 / 캔버스 폭 620 / 전제를 각주로 밝히지 않음.
 *
 * 데이터는 8, 3, 10, 1, 6, 14, 4, 7, 13 을 이 순서로 넣어 만든 이진 탐색
 * 트리다 (노드 아홉, 높이 4 층). 뿌리 8 은 화면 위에서 가운데 자리를
 * 차지하지만, 중위로 걸으면 아홉 중 여섯째로 나온다 — 트리 위의 자리와
 * 나온 순서가 무관하다는 것이 이 조각의 재료다.
 *
 * 순회 순서(traversalOrder) 조각과의 관계: 그쪽은 "같은 나무를 세 가지
 * 차례로 훑으면 무엇이 달라지는가" 를 묻고, 이 조각은 중위 하나만 골라
 * "그 결과가 왜 항상 오름차순인가" 를 묻는다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const bstInorderSortedFacet: FacetJson = {
  id: 'facet:bstInorderSorted',
  title: {
    en: 'BST Inorder Is Sorted',
    ko: '중위 순회는 정렬되어 나온다',
    ja: '二分探索木の通りがけ順は整列して出る',
    zh: '二叉搜索树的中序遍历是有序的',
    ar: 'الاجتياز الوسطي لشجرة البحث الثنائية مرتَّب',
    es: 'El inorden de un ABB sale ordenado',
    fr: "Le parcours infixe d'un ABR sort trié",
    hi: 'BST का मध्यक्रम क्रमबद्ध निकलता है',
    id: 'Inorder BST keluar terurut',
    pt: 'A ordem infixa de uma ABB sai ordenada',
  },
  description: {
    en: 'Walk inorder — empty the left, put yourself down, cross to the right — and the values come out low to high',
    ko: '중위로 걷는다 — 왼쪽을 비우고, 자기를 내놓고, 오른쪽으로 넘어간다 — 그러면 값이 작은 것부터 큰 것까지 나온다',
    ja: '通りがけ順に歩く — 左を空にし、自分を置き、右へ渡る — すると値は小さい順に出てくる',
    zh: '按中序走 — 先清空左边，放下自己，再过到右边 — 值就从小到大出来',
    ar: 'امشِ بالترتيب الوسطي — أفرِغ اليسار، ضع نفسك، ثم اعبر يمينًا — فتخرج القيم من الأصغر إلى الأكبر',
    es: 'Recorre en inorden: vacía la izquierda, deposítate, cruza a la derecha, y los valores salen de menor a mayor',
    fr: "Parcourez en infixe — videz la gauche, déposez-vous, passez à droite — et les valeurs sortent de la plus petite à la plus grande",
    hi: 'मध्यक्रम में चलें — बाएँ को खाली करें, खुद को रखें, दाएँ पार जाएँ — और मान छोटे से बड़े क्रम में निकलते हैं',
    id: 'Telusuri secara inorder — kosongkan yang kiri, letakkan diri, menyeberang ke kanan — dan nilainya keluar dari kecil ke besar',
    pt: 'Percorra em ordem — esvazie a esquerda, deponha-se, passe à direita — e os valores saem do menor ao maior',
  },
  algorithm: 'module:bstInorderSorted',
  projector: 'module:bstInorderSortedProjector',
  initialData: {
    type: 'bst-inorder-sorted',
    rootValue: 8,
    // 8, 3, 10, 1, 6, 14, 4, 7, 13 을 이 순서로 넣어 만든 이진 탐색 트리.
    nodes: [
      { value: 8, left: 3, right: 10 },
      { value: 3, left: 1, right: 6 },
      { value: 10, left: null, right: 14 },
      { value: 6, left: 4, right: 7 },
      { value: 14, left: 13, right: null },
      { value: 1, left: null, right: null },
      { value: 4, left: null, right: null },
      { value: 7, left: null, right: null },
      { value: 13, left: null, right: null },
    ],
    stepMs: 620,
  },
  shuffleOnReset: false,
  messages: {
    'caption.stand': {
      en: '{value} stands — empty the left first.',
      ko: '{value} 에 선다 — 먼저 왼쪽을 비운다.',
      ja: '{value} に立つ — まず左を空にする。',
      zh: '站在 {value} — 先清空左边。',
      ar: 'نقف عند {value} — أفرِغ اليسار أولًا.',
      es: 'De pie en {value}: primero vacía la izquierda.',
      fr: "On se tient en {value} — videz d'abord la gauche.",
      hi: '{value} पर खड़े हैं — पहले बाएँ को खाली करें।',
      id: 'Berdiri di {value} — kosongkan yang kiri dulu.',
      pt: 'Parado em {value} — esvazie a esquerda primeiro.',
    },
    'caption.output': {
      en: '{value} flows out — {n} placed so far.',
      ko: '{value} 가 흘러나온다 — 지금까지 {n} 개 쌓였다.',
      ja: '{value} が流れ出る — ここまでで {n} 個。',
      zh: '{value} 流出来了 — 到目前为止 {n} 个。',
      ar: '{value} يخرج — {n} حتى الآن.',
      es: 'Sale {value}: {n} colocados hasta ahora.',
      fr: "{value} ressort — {n} placés jusqu'ici.",
      hi: '{value} बाहर आता है — अब तक {n} रखे गए।',
      id: '{value} mengalir keluar — {n} sudah tertata.',
      pt: '{value} sai — {n} colocados até agora.',
    },
    'caption.done': {
      en: 'All {n} are out, low to high.',
      ko: '{n} 개가 모두 나왔다 — 작은 것부터 큰 것까지.',
      ja: '{n} 個すべてが小さい順に出た。',
      zh: '{n} 个全出来了，从小到大。',
      ar: 'خرجت كل الـ{n} من الأصغر إلى الأكبر.',
      es: 'Los {n} han salido, de menor a mayor.',
      fr: 'Les {n} sont sortis, du plus petit au plus grand.',
      hi: 'सभी {n} निकल गए, छोटे से बड़े।',
      id: 'Semua {n} sudah keluar, dari kecil ke besar.',
      pt: 'Todos os {n} saíram, do menor ao maior.',
    },
  },
  blocks: {
    stage: { type: 'bst-inorder-sorted-stage' },
    // 조각의 표준 묶음 — 다시 보기 · 한 걸음 (S-piece).
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
};
