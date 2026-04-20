import type { FacetJson } from '@facet/core/runtime';

export const linearsearchFacet: FacetJson = {
  id: 'facet:linearSearch',
  title: { en: 'Linear Search', ko: '선형 탐색' },
  description: {
    en: 'Sequential probe — O(n)',
    ko: '순차 비교 — O(n)',
  },
  algorithm: 'module:linearsearch',
  projector: 'module:linearsearchProjector',
  initialData: { type: 'array', values: [5, 2, 8, 1, 9, 3, 7, 4], target: 3 },
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      { ref: 'targetDisplay' },
      { ref: 'stage' },
      { ref: 'resultDisplay' },
      { ref: 'controls' },
      { ref: 'codePanel' },
    ],
  },
  blocks: {
    header: { type: 'title-block' },
    targetDisplay: { type: 'text-display', label: { en: 'Target', ko: '목표값' } },
    stage: { type: 'bar-chart', height: 220 },
    resultDisplay: { type: 'text-display', label: { en: 'Result', ko: '결과' } },
    codePanel: {
      type: 'code-view',
      label: { en: 'Code', ko: '코드' },
      ir: 'ir:linearsearch-imperative',
    },
    controls: {
      type: 'control-bar',
      controls: ['play', 'step', 'pause', 'reset', { type: 'speed-slider', default: 1 }],
      metrics: [
        { name: 'probe-count', label: { en: 'Probe', ko: '비교' }, initial: 0 },
      ],
    },
  },
};
