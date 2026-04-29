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

import type { FacetJson } from '@facet/core/runtime';
import { BST_CANVAS } from './projector.js';

export const bstFacet: FacetJson = {
  id: 'facet:bst',
  title: { en: 'Binary Search Tree', ko: '이진 탐색 트리 (BST)' },
  description: {
    en: 'Fold half the world with every comparison — the decisive cut of BST',
    ko: '비교 한 번에 세계의 절반을 접어 버리는 정렬형 이진 트리',
  },
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
      label: { en: 'Compare', ko: '비교' },
    },
    tiltGauge: {
      type: 'text-display',
      label: { en: 'Tilt', ko: '기울기' },
    },
    controls: {
      type: 'control-bar',
      controls: [{ widget: 'button', action: 'play' }, { widget: 'button', action: 'step' }, { widget: 'button', action: 'pause' }, { widget: 'button', action: 'reset' }, { widget: 'speed-slider', action: 'speed', default: 1 }],
      metrics: [
        { name: 'compare-count', label: { en: 'Compares', ko: '비교' }, initial: 0 },
        { name: 'insert-count', label: { en: 'Inserts', ko: '삽입' }, initial: 0 },
        { name: 'delete-count', label: { en: 'Deletes', ko: '삭제' }, initial: 0 },
        { name: 'search-hit-count', label: { en: 'Hits', ko: 'hit' }, initial: 0 },
        { name: 'search-miss-count', label: { en: 'Misses', ko: 'miss' }, initial: 0 },
        { name: 'rejected-duplicate', label: { en: 'Duplicates', ko: '중복' }, initial: 0 },
      ],
    },
    codePanel: {
      type: 'code-view',
      label: { en: 'Code', ko: '코드' },
      ir: 'ir:bst-recursive',
    },
  },
};
