import type { FacetJson } from '@facet/core/runtime';

export const knapsackFacet: FacetJson = {
  id: 'facet:knapsack',
  title: { en: '0/1 Knapsack (B&B)', ko: '0/1 배낭 (분기 한정)' },
  description: {
    en: 'Branch and prune by upper bound',
    ko: '상계로 가지치는 분기 한정',
  },
  algorithm: 'module:knapsack',
  projector: 'module:knapsackProjector',
  initialData: {
    type: 'knapsack',
    values: [60, 100, 120, 80, 30],
    weights: [10, 20, 30, 15, 5],
    capacity: 50,
  },
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      { ref: 'capacityDisplay' },
      { ref: 'stage' },
      { ref: 'bestDisplay' },
      { ref: 'resultDisplay' },
      { ref: 'controls' },
      { ref: 'codePanel' },
    ],
  },
  blocks: {
    header: { type: 'title-block' },
    capacityDisplay: { type: 'text-display', label: { en: 'Capacity', ko: '용량' } },
    stage: { type: 'bar-chart', height: 220 },
    bestDisplay: { type: 'text-display', label: { en: 'Current best', ko: '최선값' } },
    resultDisplay: { type: 'text-display', label: { en: 'Result', ko: '결과' } },
    codePanel: {
      type: 'code-view',
      label: { en: 'Code', ko: '코드' },
      ir: 'ir:knapsack-imperative',
    },
    controls: {
      type: 'control-bar',
      controls: [{ widget: 'button', action: 'play' }, { widget: 'button', action: 'step' }, { widget: 'button', action: 'pause' }, { widget: 'button', action: 'reset' }, { widget: 'speed-slider', action: 'speed', default: 1 }],
      metrics: [
        { name: 'visit-count', label: { en: 'Visit', ko: '방문' }, initial: 0 },
        { name: 'prune-count', label: { en: 'Prune', ko: '가지치기' }, initial: 0 },
      ],
    },
  },
};
