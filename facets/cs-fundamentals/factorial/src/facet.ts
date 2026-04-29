import type { FacetJson } from '@facet/core/runtime';

export const factorialFacet: FacetJson = {
  id: 'facet:factorial',
  title: { en: 'Factorial (Recursion)', ko: '팩토리얼 (재귀)' },
  description: {
    en: 'Visualize the recursive call stack',
    ko: '재귀 콜 스택을 막대로 시각화',
  },
  algorithm: 'module:factorial',
  projector: 'module:factorialProjector',
  initialData: { type: 'integer', n: 6 },
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      { ref: 'inputDisplay' },
      { ref: 'stage' },
      { ref: 'partialDisplay' },
      { ref: 'resultDisplay' },
      { ref: 'controls' },
      { ref: 'codePanel' },
    ],
  },
  blocks: {
    header: { type: 'title-block' },
    inputDisplay: { type: 'text-display', label: { en: 'Input', ko: '입력' } },
    stage: { type: 'bar-chart', height: 220 },
    partialDisplay: { type: 'text-display', label: { en: 'Partial', ko: '부분 결과' } },
    resultDisplay: { type: 'text-display', label: { en: 'Result', ko: '결과' } },
    codePanel: {
      type: 'code-view',
      label: { en: 'Code', ko: '코드' },
      ir: 'ir:factorial-imperative',
    },
    controls: {
      type: 'control-bar',
      controls: [{ widget: 'button', action: 'play' }, { widget: 'button', action: 'step' }, { widget: 'button', action: 'pause' }, { widget: 'button', action: 'reset' }, { widget: 'speed-slider', action: 'speed', default: 1 }],
      metrics: [
        { name: 'call-count', label: { en: 'Calls', ko: '호출' }, initial: 0 },
      ],
    },
  },
};
