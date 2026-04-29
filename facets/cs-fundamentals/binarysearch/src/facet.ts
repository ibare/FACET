import type { FacetJson } from '@facet/core/runtime';

export const binarysearchFacet: FacetJson = {
  id: 'facet:binarySearch',
  title: { en: 'Binary Search', ko: '이진 탐색' },
  description: {
    en: 'Halve the range each step — O(log n)',
    ko: '범위를 반씩 좁힌다 — O(log n)',
  },
  algorithm: 'module:binarysearch',
  projector: 'module:binarysearchProjector',
  initialData: { type: 'array', values: [1, 3, 5, 7, 9, 11, 13, 15], target: 11 },
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
      ir: 'ir:binarysearch-imperative',
    },
    controls: {
      type: 'control-bar',
      controls: [{ widget: 'button', action: 'play' }, { widget: 'button', action: 'step' }, { widget: 'button', action: 'pause' }, { widget: 'button', action: 'reset' }, { widget: 'speed-slider', action: 'speed', default: 1 }],
      metrics: [
        { name: 'probe-count', label: { en: 'Probe', ko: '비교' }, initial: 0 },
      ],
    },
  },
};
