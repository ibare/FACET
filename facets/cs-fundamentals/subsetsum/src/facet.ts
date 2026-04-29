import type { FacetJson } from '@facet/core/runtime';

export const subsetsumFacet: FacetJson = {
  id: 'facet:subsetSum',
  title: { en: 'Subset Sum (Backtracking)', ko: '부분집합 합 (백트래킹)' },
  description: {
    en: 'Try / undo / prune',
    ko: '시도-되돌리기-가지치기',
  },
  algorithm: 'module:subsetsum',
  projector: 'module:subsetsumProjector',
  initialData: { type: 'subsetsum', values: [3, 7, 1, 8, 4, 2], target: 13 },
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      { ref: 'targetDisplay' },
      { ref: 'stage' },
      { ref: 'sumDisplay' },
      { ref: 'resultDisplay' },
      { ref: 'controls' },
      { ref: 'codePanel' },
    ],
  },
  blocks: {
    header: { type: 'title-block' },
    targetDisplay: { type: 'text-display', label: { en: 'Target', ko: '목표값' } },
    stage: { type: 'bar-chart', height: 220 },
    sumDisplay: { type: 'text-display', label: { en: 'Current sum', ko: '현재 합' } },
    resultDisplay: { type: 'text-display', label: { en: 'Result', ko: '결과' } },
    codePanel: {
      type: 'code-view',
      label: { en: 'Code', ko: '코드' },
      ir: 'ir:subsetsum-imperative',
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
