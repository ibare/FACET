import type { FacetJson } from '@facet/core/runtime';

export const selectionsortFacet: FacetJson = {
  id: 'facet:selectionSort',
  title: { en: 'Selection Sort', ko: '선택 정렬' },
  description: {
    en: 'Find the minimum, swap to front — O(n²)',
    ko: '최솟값을 찾아 앞으로 — O(n²)',
  },
  algorithm: 'module:selectionsort',
  projector: 'module:selectionsortProjector',
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
      ir: 'ir:selectionsort-imperative',
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
