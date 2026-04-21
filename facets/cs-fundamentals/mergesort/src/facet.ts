import type { FacetJson } from '@facet/core/runtime';

export const mergesortFacet: FacetJson = {
  id: 'facet:mergeSort',
  title: { en: 'Merge Sort', ko: '머지 정렬' },
  description: {
    en: 'Divide and merge — stable O(n log n)',
    ko: '분할과 병합 — 안정적인 O(n log n)',
  },
  algorithm: 'module:mergesort',
  projector: 'module:mergesortProjector',
  initialData: { type: 'array', values: [5, 2, 8, 1, 9, 3, 7, 4] },
  shuffleOnReset: true,
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
      ir: 'ir:mergesort-imperative',
    },
    controls: {
      type: 'control-bar',
      controls: ['play', 'step', 'pause', 'reset', { type: 'speed-slider', default: 1 }],
      metrics: [
        { name: 'compare-count', label: { en: 'Compare', ko: '비교' }, initial: 0 },
        { name: 'write-count', label: { en: 'Write', ko: '쓰기' }, initial: 0 },
      ],
    },
  },
};
