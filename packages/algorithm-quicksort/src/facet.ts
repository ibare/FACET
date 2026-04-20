/**
 * QuickSort facet JSON 선언.
 */

import type { FacetJson } from '@facet/core/runtime';

export const quicksortFacet: FacetJson = {
  id: 'facet:quickSort',
  title: { en: 'Quick Sort', ko: '퀵 정렬' },
  description: {
    en: 'Divide and conquer by pivot — average O(n log n)',
    ko: 'pivot 기준 분할 정복 — 평균 O(n log n)',
  },
  algorithm: 'module:quicksort',
  projector: 'module:quicksortProjector',
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
      ir: 'ir:quicksort-imperative',
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
