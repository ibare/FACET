import type { FacetJson } from '@facet/core/runtime';

export const heapsortFacet: FacetJson = {
  id: 'facet:heapSort',
  title: { en: 'Heap Sort', ko: '힙 정렬' },
  description: {
    en: 'Build max-heap, repeatedly extract — O(n log n)',
    ko: '최대 힙 구축 후 반복 추출 — O(n log n)',
  },
  algorithm: 'module:heapsort',
  projector: 'module:heapsortProjector',
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
      ir: 'ir:heapsort-imperative',
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
