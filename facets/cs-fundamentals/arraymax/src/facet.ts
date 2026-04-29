import type { FacetJson } from '@facet/core/runtime';

export const arraymaxFacet: FacetJson = {
  id: 'facet:arrayMax',
  title: { en: 'Array Max (Divide & Conquer)', ko: '배열 최댓값 (분할 정복)' },
  description: {
    en: 'Split, recurse, combine — O(n)',
    ko: '쪼개고 재귀하고 합친다 — O(n)',
  },
  algorithm: 'module:arraymax',
  projector: 'module:arraymaxProjector',
  initialData: { type: 'array', values: [3, 7, 2, 8, 4, 1, 9, 5] },
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      { ref: 'stage' },
      { ref: 'resultDisplay' },
      { ref: 'controls' },
      { ref: 'codePanel' },
    ],
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'bar-chart', height: 220 },
    resultDisplay: { type: 'text-display', label: { en: 'Result', ko: '결과' } },
    codePanel: {
      type: 'code-view',
      label: { en: 'Code', ko: '코드' },
      ir: 'ir:arraymax-imperative',
    },
    controls: {
      type: 'control-bar',
      controls: [{ widget: 'button', action: 'play' }, { widget: 'button', action: 'step' }, { widget: 'button', action: 'pause' }, { widget: 'button', action: 'reset' }, { widget: 'speed-slider', action: 'speed', default: 1 }],
      metrics: [
        { name: 'call-count', label: { en: 'Calls', ko: '호출' }, initial: 0 },
        { name: 'compare-count', label: { en: 'Compare', ko: '비교' }, initial: 0 },
      ],
    },
  },
};
