/**
 * BST facet JSON 선언.
 *
 * 시각적 정체성 5종을 한눈에 드러내는 레이아웃:
 *   - stage(tree-layout, binary-ordered + 5 features)
 *       좌소우대 색지 / 폴드 / 경로 조명 / inorder 바닥선 / ghost probe / aux cursor.
 *   - compareHud(text-display) — `[키 48] < [노드 50]` 식 비교 결과.
 *   - tiltGauge(text-display)  — 기울기 지표 `h / log₂(n+1)`.
 *   - codePanel(code-view, bst-recursive)
 *
 * 기획 섹션 9 의 자동 시나리오 — 한 번 재생으로 hit/miss/insert/leaf 삭제/
 * 두 자식 후계자 삭제의 다섯 경로 유형을 모두 관찰.
 *
 * 수동 콘솔, preset 드롭다운, 재귀/반복 토글, step mode 해상도는 첫 구현 비활성
 * (tasks/facet/datastructure-bst-extension-plan.md §4 결정).
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { BST_CANVAS } from './projector.js';

export const bstFacet: FacetJson = {
  id: 'facet:bst',
  title: { en: 'Binary Search Tree', ko: '이진 탐색 트리 (BST)', ja: '二分探索木', zh: '二叉搜索树', ar: 'شجرة البحث الثنائية', es: 'Árbol binario de búsqueda', fr: 'Arbre binaire de recherche', hi: 'द्विआधारी खोज वृक्ष', id: 'Pohon pencarian biner', pt: 'Árvore binária de busca' },
  description: { en: 'Fold half the world with every comparison — the decisive cut of BST', ko: '비교 한 번에 세계의 절반을 접어 버리는 정렬형 이진 트리', ja: '比較一回で世界の半分を畳む — BST の決定的な一刀', zh: '一次比较折掉一半世界 — BST 那决定性的一刀', ar: 'طيّ نصف العالم بكل مقارنة — قطع BST الحاسم', es: 'Doblar medio mundo con cada comparación: el corte decisivo del BST', fr: 'Plier la moitié du monde à chaque comparaison — la coupe décisive du BST', hi: 'हर तुलना पर आधी दुनिया मुड़ जाती है — BST का निर्णायक कट', id: 'Melipat separuh dunia tiap satu perbandingan — potongan menentukan dari BST', pt: 'Dobrar metade do mundo a cada comparação — o corte decisivo da BST' },
  algorithm: 'module:bst',
  projector: 'module:bstProjector',
  initialData: {
    type: 'bst',
    // 기획 9-a 시드 — 중간 높이의 균형 잡힌 초기 트리.
    initialValues: [50, 30, 70, 20, 40, 60, 80, 10, 35, 55, 75],
    // 기획 9-a 자동 재생 시나리오.
    scenario: [
      { op: 'search', value: 35 },
      { op: 'search', value: 42 },
      { op: 'insert', value: 42 },
      { op: 'insert', value: 65 },
      { op: 'delete', value: 30 },
      { op: 'delete', value: 80 },
      { op: 'insert', value: 5 },
    ],
  },
  // 시나리오 순서 = 학습 설명의 순서. 섞지 않는다.
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      {
        type: 'row',
        gap: 8,
        align: 'stretch',
        children: [
          { ref: 'stage', grow: 1 },
          {
            type: 'column',
            gap: 8,
            children: [{ ref: 'compareHud' }, { ref: 'tiltGauge' }],
          },
        ],
      },
      { ref: 'controls' },
      { ref: 'codePanel' },
    ],
  },
  messages: {
    'hud.compare': {
      en: '[key {key}] {sym} [node {node}]',
      ko: '[키 {key}] {sym} [노드 {node}]',
      ja: '[キー {key}] {sym} [ノード {node}]',
      zh: '[键 {key}] {sym} [节点 {node}]',
      ar: '[مفتاح {key}] {sym} [عقدة {node}]',
      es: '[clave {key}] {sym} [nodo {node}]',
      fr: '[clé {key}] {sym} [nœud {node}]',
      hi: '[कुंजी {key}] {sym} [नोड {node}]',
      id: '[kunci {key}] {sym} [simpul {node}]',
      pt: '[chave {key}] {sym} [nó {node}]',
    },
    'hud.done': {
      en: 'Done',
      ko: '완료',
      ja: '完了',
      zh: '完成',
      ar: 'تم',
      es: 'Listo',
      fr: 'Terminé',
      hi: 'पूर्ण',
      id: 'Selesai',
      pt: 'Concluído',
    },
    'hud.empty': {
      en: 'Tree is empty',
      ko: '트리 비어있음',
      ja: 'ツリーは空です',
      zh: '树为空',
      ar: 'الشجرة فارغة',
      es: 'El árbol está vacío',
      fr: 'L\'arbre est vide',
      hi: 'वृक्ष खाली है',
      id: 'Pohon kosong',
      pt: 'A árvore está vazia',
    },
  },
  blocks: {
    header: { type: 'title-block' },
    stage: {
      type: 'tree-layout',
      width: BST_CANVAS.width,
      height: BST_CANVAS.height,
      layoutMode: 'binary-ordered',
      features: [
        'subtree-shade',
        'fold-collapse',
        'inorder-projection',
        'cursor',
        'aux-cursor',
        'ghost-probe',
      ],
      inorderStripHeight: BST_CANVAS.stripH,
    },
    compareHud: {
      type: 'text-display',
      label: { en: 'Compare', ko: '비교', ja: '比較', zh: '比较', ar: 'مقارنة', es: 'Comparar', fr: 'Comparer', hi: 'तुलना', id: 'Banding', pt: 'Comparar' },
    },
    tiltGauge: {
      type: 'text-display',
      label: { en: 'Tilt', ko: '기울기', ja: '傾き', zh: '倾斜', ar: 'ميل', es: 'Inclinación', fr: 'Inclinaison', hi: 'झुकाव', id: 'Kemiringan', pt: 'Inclinação' },
    },
    controls: {
      type: 'control-bar',
      controls: [{ widget: 'button', action: 'play' }, { widget: 'button', action: 'step' }, { widget: 'button', action: 'pause' }, { widget: 'button', action: 'reset' }, { widget: 'speed-slider', action: 'speed', default: 1 }],
      metrics: [
        { name: 'compare-count', label: { en: 'Compares', ko: '비교', ja: '比較回数', zh: '比较次数', ar: 'مقارنات', es: 'Comparaciones', fr: 'Comparaisons', hi: 'तुलनाएँ', id: 'Perbandingan', pt: 'Comparações' }, initial: 0 },
        { name: 'insert-count', label: { en: 'Inserts', ko: '삽입', ja: '挿入回数', zh: '插入次数', ar: 'إدراجات', es: 'Inserciones', fr: 'Insertions', hi: 'प्रविष्टियाँ', id: 'Penyisipan', pt: 'Inserções' }, initial: 0 },
        { name: 'delete-count', label: { en: 'Deletes', ko: '삭제', ja: '削除回数', zh: '删除次数', ar: 'حذوفات', es: 'Eliminaciones', fr: 'Suppressions', hi: 'विलोपन', id: 'Penghapusan', pt: 'Remoções' }, initial: 0 },
        { name: 'search-hit-count', label: { en: 'Hits', ko: 'hit', ja: '命中', zh: '命中数', ar: 'إصابات', es: 'Aciertos', fr: 'Succès', hi: 'हिट', id: 'Hit', pt: 'Acertos' }, initial: 0 },
        { name: 'search-miss-count', label: { en: 'Misses', ko: 'miss', ja: '不発', zh: '未命中数', ar: 'إخفاقات', es: 'Fallos', fr: 'Échecs', hi: 'मिस', id: 'Miss', pt: 'Falhas' }, initial: 0 },
        { name: 'rejected-duplicate', label: { en: 'Duplicates', ko: '중복', ja: '重複', zh: '重复', ar: 'مكررات', es: 'Duplicados', fr: 'Doublons', hi: 'दोहराव', id: 'Duplikat', pt: 'Duplicados' }, initial: 0 },
      ],
    },
    codePanel: {
      type: 'code-view',
      label: { en: 'Code', ko: '코드', ja: 'コード', zh: '代码', ar: 'الشيفرة', es: 'Código', fr: 'Code', hi: 'कोड', id: 'Kode', pt: 'Código' },
      ir: 'ir:bst-recursive',
    },
  },
};
