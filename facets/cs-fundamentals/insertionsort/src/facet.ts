import type { FacetJson } from '@facet/core/runtime';

export const insertionsortFacet: FacetJson = {
  id: 'facet:insertionSort',
  title: { en: 'Insertion Sort', ko: '삽입 정렬' },
  description: {
    en: 'Insert each element into its place — O(n²) but fast on near-sorted',
    ko: '각 원소를 적절한 자리에 삽입 — O(n²) 이지만 거의 정렬된 입력에 빠름',
  },
  algorithm: 'module:insertionsort',
  projector: 'module:insertionsortProjector',
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
      ir: 'ir:insertionsort-imperative',
    },
    controls: {
      type: 'control-bar',
      controls: ['play', 'step', 'pause', 'reset', { type: 'speed-slider', default: 1 }],
      metrics: [
        { name: 'compare-count', label: { en: 'Compare', ko: '비교' }, initial: 0 },
        { name: 'shift-count', label: { en: 'Shift', ko: '이동' }, initial: 0 },
      ],
    },
  },
};
