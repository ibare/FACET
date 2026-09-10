/**
 * @piece 배열 기반 트리 — 번호로 건너간다.
 *
 * 답하는 질문 하나: **배열 하나로 나무를 어떻게 흉내 내는가.** 한 줄로 늘어선
 * 칸과 나무의 자리가 같은 것의 두 모습임을 보이고, 잇는 줄(포인터) 없이
 * `2i+1` · `2i+2` · `⌊(i−1)/2⌋` 셈만으로 부모와 자식 사이를 오간다.
 *
 * 조각이므로 header 도 metrics 도 두지 않는다 (S-piece). 제목은 글의 문단이
 * 주고, 셀 것은 없다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const arrayAsTreeFacet: FacetJson = {
  id: 'facet:arrayAsTree',
  title: {
    en: 'Array as a tree',
    ko: '배열 기반 트리',
    ja: '配列で表す木',
    zh: '用数组表示树',
    ar: 'المصفوفة كشجرة',
    es: 'Un arreglo como árbol',
    fr: 'Un tableau comme arbre',
    hi: 'ऐरे को ट्री की तरह',
    id: 'Larik sebagai pohon',
    pt: 'Um vetor como árvore',
  },
  description: {
    en: 'How one array stands in for a tree — no stored links, only index arithmetic.',
    ko: '배열 하나로 나무를 흉내 내는 법 — 저장된 링크 없이, 번호 셈만으로.',
    ja: '配列一つで木を表す方法 — 保存されたリンクはなく、添字の計算だけ。',
    zh: '一个数组如何充当一棵树 — 不存链接，只用下标运算。',
    ar: 'كيف تنوب مصفوفة واحدة عن شجرة — بلا روابط مخزَّنة، بحساب الفهارس وحده.',
    es: 'Cómo un solo arreglo hace de árbol: sin enlaces guardados, solo aritmética de índices.',
    fr: "Comment un seul tableau tient lieu d'arbre — sans liens stockés, rien que du calcul d'indices.",
    hi: 'एक ही ऐरे कैसे ट्री का काम करता है — कोई संग्रहित लिंक नहीं, सिर्फ इंडेक्स का गणित।',
    id: 'Bagaimana satu larik menggantikan pohon — tanpa tautan tersimpan, hanya hitungan indeks.',
    pt: 'Como um único vetor faz as vezes de árvore — sem links guardados, só aritmética de índices.',
  },
  algorithm: 'module:arrayAsTree',
  projector: 'module:arrayAsTreeProjector',

  initialData: {
    type: 'array-as-tree',
    values: [3, 5, 8, 9, 6, 12, 10],
    stepMs: 640,
  },

  blocks: {
    stage: { type: 'array-as-tree-stage' },
    controls: { type: 'control-bar', controls: [CONTROL.replay, CONTROL.advance] },
  },

  messages: {
    'caption.start': {
      en: 'Index {i} — the root of the tree.',
      ko: '자리 {i} — 나무의 뿌리.',
      ja: '添字 {i} — 木の根。',
      zh: '下标 {i} — 树的根。',
      ar: 'الفهرس {i} — جذر الشجرة.',
      es: 'Índice {i}: la raíz del árbol.',
      fr: "Indice {i} — la racine de l'arbre.",
      hi: 'इंडेक्स {i} — ट्री की जड़।',
      id: 'Indeks {i} — akar pohon.',
      pt: 'Índice {i} — a raiz da árvore.',
    },
    'caption.descendLeft': {
      en: 'Left child: 2 × {from} + 1 = {to}.',
      ko: '왼쪽 자식: 2 × {from} + 1 = {to}.',
      ja: '左の子: 2 × {from} + 1 = {to}。',
      zh: '左子节点: 2 × {from} + 1 = {to}。',
      ar: 'الابن الأيسر: 2 × {from} + 1 = {to}.',
      es: 'Hijo izquierdo: 2 × {from} + 1 = {to}.',
      fr: 'Enfant gauche : 2 × {from} + 1 = {to}.',
      hi: 'बायाँ बच्चा: 2 × {from} + 1 = {to}.',
      id: 'Anak kiri: 2 × {from} + 1 = {to}.',
      pt: 'Filho esquerdo: 2 × {from} + 1 = {to}.',
    },
    'caption.descendRight': {
      en: 'Right child: 2 × {from} + 2 = {to}.',
      ko: '오른쪽 자식: 2 × {from} + 2 = {to}.',
      ja: '右の子: 2 × {from} + 2 = {to}。',
      zh: '右子节点: 2 × {from} + 2 = {to}。',
      ar: 'الابن الأيمن: 2 × {from} + 2 = {to}.',
      es: 'Hijo derecho: 2 × {from} + 2 = {to}.',
      fr: 'Enfant droit : 2 × {from} + 2 = {to}.',
      hi: 'दायाँ बच्चा: 2 × {from} + 2 = {to}.',
      id: 'Anak kanan: 2 × {from} + 2 = {to}.',
      pt: 'Filho direito: 2 × {from} + 2 = {to}.',
    },
    'caption.ascend': {
      en: 'Parent: ⌊({from} − 1) / 2⌋ = {to}.',
      ko: '부모: ⌊({from} − 1) / 2⌋ = {to}.',
      ja: '親: ⌊({from} − 1) / 2⌋ = {to}。',
      zh: '父节点: ⌊({from} − 1) / 2⌋ = {to}。',
      ar: 'الأب: ⌊({from} − 1) / 2⌋ = {to}.',
      es: 'Padre: ⌊({from} − 1) / 2⌋ = {to}.',
      fr: 'Parent : ⌊({from} − 1) / 2⌋ = {to}.',
      hi: 'जनक: ⌊({from} − 1) / 2⌋ = {to}.',
      id: 'Induk: ⌊({from} − 1) / 2⌋ = {to}.',
      pt: 'Pai: ⌊({from} − 1) / 2⌋ = {to}.',
    },
    'caption.root': {
      en: 'Parent: ⌊({from} − 1) / 2⌋ = {to} — back at the root.',
      ko: '부모: ⌊({from} − 1) / 2⌋ = {to} — 뿌리로 돌아왔다.',
      ja: '親: ⌊({from} − 1) / 2⌋ = {to} — 根に戻った。',
      zh: '父节点: ⌊({from} − 1) / 2⌋ = {to} — 回到了根。',
      ar: 'الأب: ⌊({from} − 1) / 2⌋ = {to} — عدنا إلى الجذر.',
      es: 'Padre: ⌊({from} − 1) / 2⌋ = {to} — de vuelta en la raíz.',
      fr: 'Parent : ⌊({from} − 1) / 2⌋ = {to} — de retour à la racine.',
      hi: 'जनक: ⌊({from} − 1) / 2⌋ = {to} — वापस जड़ पर।',
      id: 'Induk: ⌊({from} − 1) / 2⌋ = {to} — kembali ke akar.',
      pt: 'Pai: ⌊({from} − 1) / 2⌋ = {to} — de volta à raiz.',
    },
    'caption.leaf': {
      en: '{l} and {r} both fall past the last cell ({n} of them) — {at} has no child. It is a leaf.',
      ko: '{l}과 {r} 모두 마지막 칸({n}개)을 넘는다 — {at}에는 자식이 없다. 잎이다.',
      ja: '{l} も {r} も最後のマス（{n} 個）を超える — {at} に子はない。葉だ。',
      zh: '{l} 和 {r} 都越过了最后一格（共 {n} 个）— {at} 没有子节点，是叶子。',
      ar: '{l} و{r} كلاهما يتجاوز آخر خانة ({n} خانة) — لا ابن لـ {at}. إنها ورقة.',
      es: '{l} y {r} caen más allá de la última casilla (son {n}): {at} no tiene hijos. Es una hoja.',
      fr: "{l} et {r} dépassent tous deux la dernière case ({n} en tout) — {at} n'a pas d'enfant. C'est une feuille.",
      hi: '{l} और {r} दोनों आखिरी खाने ({n} खाने) से आगे चले जाते हैं — {at} का कोई बच्चा नहीं। यह पत्ती है।',
      id: '{l} dan {r} sama-sama melewati sel terakhir (ada {n}) — {at} tidak punya anak. Ini daun.',
      pt: '{l} e {r} passam da última casa (são {n}) — {at} não tem filho. É uma folha.',
    },
    'caption.saved': {
      en: '{n} cells hold {n} values and {links} stored links. The same shape as linked nodes would need {hypo}.',
      ko: '{n}개 칸에 값 {n}개, 저장된 링크는 {links}개. 노드로 이었다면 {hypo}개가 필요했다.',
      ja: '{n} 個のマスに値 {n} 個、保存されたリンクは {links} 個。ノードでつないだなら {hypo} 個が要る。',
      zh: '{n} 个格子装 {n} 个值，存下的链接是 {links} 个。若用节点相连，则需要 {hypo} 个。',
      ar: '{n} خانة تحمل {n} قيمة و{links} رابطًا مخزَّنًا. الشكل نفسه بعُقد موصولة كان سيحتاج {hypo}.',
      es: '{n} casillas guardan {n} valores y {links} enlaces. La misma forma con nodos enlazados necesitaría {hypo}.',
      fr: '{n} cases contiennent {n} valeurs et {links} liens stockés. La même forme avec des nœuds liés en demanderait {hypo}.',
      hi: '{n} खाने {n} मान और {links} संग्रहित लिंक रखते हैं। वही आकार जुड़े नोड्स से बनाने पर {hypo} चाहिए होते।',
      id: '{n} sel menyimpan {n} nilai dan {links} tautan. Bentuk yang sama dengan simpul bertaut butuh {hypo}.',
      pt: '{n} casas guardam {n} valores e {links} links. A mesma forma com nós ligados exigiria {hypo}.',
    },
  },
};
