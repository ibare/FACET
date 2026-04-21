import type { FacetJson } from '@facet/core/runtime';

export const radixsortFacet: FacetJson = {
  id: 'facet:radixSort',
  title: { en: 'Radix Sort', ko: '기수 정렬' },
  description: {
    en: 'LSD radix — stable digit-by-digit sort, O(d·n)',
    ko: 'LSD 라딕스 — 자릿수별 안정 정렬, O(d·n)',
  },
  algorithm: 'module:radixsort',
  projector: 'module:radixsortProjector',
  initialData: { type: 'array', values: [170, 45, 75, 90, 802, 24, 2, 66] },
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
      ir: 'ir:radixsort-imperative',
    },
    controls: {
      type: 'control-bar',
      controls: ['play', 'step', 'pause', 'reset', { type: 'speed-slider', default: 1 }],
      metrics: [
        { name: 'read-count', label: { en: 'Read', ko: '읽기' }, initial: 0 },
        { name: 'write-count', label: { en: 'Write', ko: '쓰기' }, initial: 0 },
      ],
    },
  },
};
