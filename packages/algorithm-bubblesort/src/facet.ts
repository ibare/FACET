/**
 * BubbleSort facet JSON 선언.
 */

import type { FacetJson } from '@facet/core/runtime';

export const bubblesortFacet: FacetJson = {
  id: 'facet:bubbleSort',
  title: { en: 'Bubble Sort', ko: '버블 정렬' },
  description: {
    en: 'Adjacent compare/swap — simple O(n²)',
    ko: '인접 비교/교환 — 단순한 O(n²)',
  },
  algorithm: 'module:bubblesort',
  projector: 'module:bubblesortProjector',
  initialData: { type: 'array', values: [5, 2, 8, 1, 9, 3, 7, 4] },
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      { ref: 'stage' },
      { ref: 'controls' },
      { ref: 'codePanel' },
    ],
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'bar-chart', height: 220 },
    codePanel: {
      type: 'code-view',
      label: { en: 'Code', ko: '코드' },
      ir: 'ir:bubblesort-imperative',
    },
    controls: {
      type: 'control-bar',
      controls: ['play', 'step', 'pause', 'reset', { type: 'speed-slider', default: 1 }],
      metrics: [
        { name: 'compare-count', label: { en: 'Compare', ko: '비교' }, initial: 0 },
        { name: 'swap-count', label: { en: 'Swap', ko: '교환' }, initial: 0 },
      ],
    },
  },
};
