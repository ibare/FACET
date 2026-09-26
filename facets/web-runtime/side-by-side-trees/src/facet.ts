import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';
import type { TreeNode } from './algorithm.js';

/**
 * @piece
 * 질문: 화면을 새로 그린 트리가 나오면, 무엇을 고쳐야 하는지 어떻게 찾는가?
 */

const oldTree: TreeNode = {
  type: 'div',
  props: [['class', 'card']],
  children: [
    {
      type: 'header',
      props: [],
      children: [
        { type: 'img', props: [['src', 'a.png']], children: [] },
        { type: 'b', props: [['text', '3']], children: [] },
      ],
    },
    {
      type: 'footer',
      props: [],
      children: [{ type: 'button', props: [['disabled', 'false']], children: [] }],
    },
  ],
};

const newTree: TreeNode = {
  type: 'div',
  props: [['class', 'card']],
  children: [
    {
      type: 'header',
      props: [],
      children: [
        { type: 'img', props: [['src', 'a.png']], children: [] },
        { type: 'b', props: [['text', '4']], children: [] },
      ],
    },
    {
      type: 'footer',
      props: [],
      children: [{ type: 'button', props: [['disabled', 'true']], children: [] }],
    },
  ],
};

export const sideBySideTreesFacet: FacetJson = {
  id: 'facet:sideBySideTrees',
  title: {
    en: 'Side by side trees',
    ko: '나란히 놓은 트리 둘',
    ja: '並べた二つのツリー',
    zh: '并排的两棵树',
    ar: 'شجرتان جنبًا إلى جنب',
    es: 'Árboles lado a lado',
    fr: 'Arbres côte à côte',
    hi: 'साथ-साथ रखे दो ट्री',
    id: 'Dua pohon berdampingan',
    pt: 'Árvores lado a lado',
  },
  description: {
    en: 'Old and new trees are walked together, node by node, top to bottom — only the properties that differ are written to the real tree.',
    ko: '옛 트리와 새 트리를 나란히 두고 위에서 아래로 한 쌍씩 짚어, 다른 속성만 실제 트리에 옮겨 적는다.',
    ja: '古いツリーと新しいツリーを並べて上から下へ一組ずつたどり、異なる属性だけを実際のツリーに書き写す。',
    zh: '把旧树和新树并排一对一从上到下走过，只把不同的属性写入真实树。',
    ar: 'تُقارَن الشجرة القديمة والجديدة معًا، عقدة تلو الأخرى من الأعلى إلى الأسفل — وتُكتب في الشجرة الحقيقية الخصائص المختلفة فقط.',
    es: 'El árbol antiguo y el nuevo se recorren juntos, nodo por nodo, de arriba hacia abajo — solo las propiedades distintas se escriben en el árbol real.',
    fr: "L'ancien arbre et le nouveau sont parcourus ensemble, nœud par nœud, de haut en bas — seules les propriétés qui diffèrent sont écrites dans l'arbre réel.",
    hi: 'पुराने और नए ट्री को साथ-साथ ऊपर से नीचे एक-एक जोड़ी करके देखा जाता है — केवल अलग गुण ही असली ट्री में लिखे जाते हैं।',
    id: 'Pohon lama dan baru ditelusuri bersama, node demi node, dari atas ke bawah — hanya properti yang berbeda yang ditulis ke pohon nyata.',
    pt: 'A árvore antiga e a nova são percorridas juntas, nó por nó, de cima para baixo — só as propriedades diferentes são escritas na árvore real.',
  },
  algorithm: 'module:sideBySideTrees',
  scene: 'module:sideBySideTreesScene',
  initialData: {
    type: 'side-by-side-trees',
    oldTree,
    newTree,
    stepMs: 1500,
  },
  shuffleOnReset: false,
  messages: {
    'label.old': {
      en: 'Old virtual tree',
      ko: '옛 가상 트리',
      ja: '古い仮想ツリー',
      zh: '旧虚拟树',
      ar: 'الشجرة الافتراضية القديمة',
      es: 'Árbol virtual antiguo',
      fr: 'Ancien arbre virtuel',
      hi: 'पुराना वर्चुअल ट्री',
      id: 'Pohon virtual lama',
      pt: 'Árvore virtual antiga',
    },
    'label.new': {
      en: 'New virtual tree',
      ko: '새 가상 트리',
      ja: '新しい仮想ツリー',
      zh: '新虚拟树',
      ar: 'الشجرة الافتراضية الجديدة',
      es: 'Árbol virtual nuevo',
      fr: 'Nouvel arbre virtuel',
      hi: 'नया वर्चुअल ट्री',
      id: 'Pohon virtual baru',
      pt: 'Árvore virtual nova',
    },
    'label.real': {
      en: 'Real tree',
      ko: '실제 트리',
      ja: '実際のツリー',
      zh: '真实树',
      ar: 'الشجرة الحقيقية',
      es: 'Árbol real',
      fr: 'Arbre réel',
      hi: 'असली ट्री',
      id: 'Pohon nyata',
      pt: 'Árvore real',
    },
    'caption.start': {
      en: 'Two virtual trees and one real tree — still the same shape.',
      ko: '가상 트리 둘과 실제 트리 하나 — 아직은 같은 모습이다.',
      ja: '仮想ツリー二つと実際のツリー一つ — まだ同じ形。',
      zh: '两棵虚拟树和一棵真实树 — 形状仍然相同。',
      ar: 'شجرتان افتراضيتان وشجرة حقيقية واحدة — لا تزال بنفس الشكل.',
      es: 'Dos árboles virtuales y un árbol real — todavía con la misma forma.',
      fr: 'Deux arbres virtuels et un arbre réel — toujours la même forme.',
      hi: 'दो वर्चुअल ट्री और एक असली ट्री — अभी भी वही आकार।',
      id: 'Dua pohon virtual dan satu pohon nyata — bentuknya masih sama.',
      pt: 'Duas árvores virtuais e uma árvore real — ainda com a mesma forma.',
    },
    'caption.same': {
      en: "'{tag}' matches — moving on.",
      ko: "'{tag}' 는 같다 — 지나간다.",
      ja: '「{tag}」は同じ — 先へ進む。',
      zh: '"{tag}" 相同 — 继续前进。',
      ar: "'{tag}' متطابقة — ننتقل للتالي.",
      es: "'{tag}' coincide — se continúa.",
      fr: '« {tag} » est identique — on continue.',
      hi: "'{tag}' मेल खाता है — आगे बढ़ते हैं।",
      id: "'{tag}' sama — lanjut.",
      pt: "'{tag}' é igual — seguindo em frente.",
    },
    'caption.patchOne': {
      en: "'{tag}': '{prop}' written to the real node ({from} → {to}).",
      ko: "'{tag}': '{prop}' 을 실제 노드에 옮겨 적는다 ({from} → {to}).",
      ja: '「{tag}」: 「{prop}」を実際のノードへ書き写す ({from} → {to})。',
      zh: '"{tag}"：把 "{prop}" 写入真实节点 ({from} → {to})。',
      ar: "'{tag}': كُتبت '{prop}' في العقدة الحقيقية ({from} → {to}).",
      es: "'{tag}': se escribe '{prop}' en el nodo real ({from} → {to}).",
      fr: '« {tag} » : « {prop} » écrit dans le nœud réel ({from} → {to}).',
      hi: "'{tag}': '{prop}' असली नोड में लिखा गया ({from} → {to})।",
      id: "'{tag}': '{prop}' ditulis ke node nyata ({from} → {to}).",
      pt: "'{tag}': '{prop}' escrito no nó real ({from} → {to}).",
    },
    'caption.patchMany': {
      en: "'{tag}' — attributes written to the real node: {count}.",
      ko: "'{tag}' — 실제 노드에 옮겨 적은 속성 수: {count}.",
      ja: '「{tag}」— 実際のノードへ書き写した属性数: {count}。',
      zh: '"{tag}" — 写入真实节点的属性数：{count}。',
      ar: "'{tag}' — عدد الخصائص المكتوبة في العقدة الحقيقية: {count}.",
      es: "'{tag}' — atributos escritos en el nodo real: {count}.",
      fr: '« {tag} » — attributs écrits dans le nœud réel : {count}.',
      hi: "'{tag}' — असली नोड में लिखे गए गुण: {count}।",
      id: "'{tag}' — atribut yang ditulis ke node nyata: {count}.",
      pt: "'{tag}' — atributos escritos no nó real: {count}.",
    },
    'caption.tally': {
      en: 'Compared {compared} of {total} · patched {patched}.',
      ko: '견준 쌍 {compared} / {total} · 고침 {patched}.',
      ja: '比較した組 {compared} / {total} · 書き換え {patched}。',
      zh: '已比较 {compared} / {total} 对 · 已修补 {patched}。',
      ar: 'تمت مقارنة {compared} من {total} · تم التصحيح: {patched}.',
      es: 'Comparados {compared} de {total} · corregidos {patched}.',
      fr: 'Comparés {compared} sur {total} · corrigés {patched}.',
      hi: 'तुलना {compared} / {total} · सुधार {patched}।',
      id: 'Dibandingkan {compared} dari {total} · ditambal {patched}.',
      pt: 'Comparados {compared} de {total} · corrigidos {patched}.',
    },
  },
  blocks: {
    stage: { type: 'side-by-side-trees-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
};
