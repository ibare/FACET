import type { FacetJson } from '@facet/core/runtime';

export const interpolationsearchFacet: FacetJson = {
  id: 'facet:interpolationSearch',
  title: { en: 'Interpolation Search', ko: '보간 탐색' },
  description: {
    en: 'Estimate position from value distribution — O(log log n) on uniform data',
    ko: '값 분포로 위치를 추정 — 균등 분포에서 O(log log n)',
  },
  algorithm: 'module:interpolationsearch',
  projector: 'module:interpolationsearchProjector',
  initialData: {
    type: 'array',
    values: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    target: 70,
  },
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
      ir: 'ir:interpolationsearch-imperative',
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
