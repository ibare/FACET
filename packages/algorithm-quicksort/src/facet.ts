/**
 * QuickSort facet JSON 선언.
 */

import type { FacetJson } from '@facet/core/runtime';

export const quicksortFacet: FacetJson = {
  id: 'facet:quickSort',
  title: '퀵 정렬',
  description: 'pivot 기준 분할 정복 — 평균 O(n log n)',
  algorithm: 'module:quicksort',
  projector: 'module:quicksortProjector',
  initialData: { type: 'array', values: [5, 2, 8, 1, 9, 3, 7, 4] },
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      {
        type: 'row',
        gap: 12,
        grow: 1,
        children: [
          { ref: 'stage', grow: 1 },
          { ref: 'codePanel', grow: 1 },
        ],
      },
      { ref: 'controls' },
    ],
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'bar-chart', height: 220 },
    codePanel: {
      type: 'code-view',
      label: 'Python · 명령형',
      ir: 'ir:quicksort-imperative',
      transpiler: 'transpiler:quicksort-python-imperative',
    },
    controls: {
      type: 'control-bar',
      controls: ['play', 'step', 'pause', 'reset', { type: 'speed-slider', default: 1 }],
      metrics: [
        { name: 'compare-count', label: '비교', initial: 0 },
        { name: 'swap-count', label: '교환', initial: 0 },
      ],
    },
  },
};
