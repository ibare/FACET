import type { FacetJson } from '@facet/core/runtime';

export const fibonaccimemoFacet: FacetJson = {
  id: 'facet:fibonacciMemo',
  title: { en: 'Fibonacci (Memoization)', ko: '피보나치 (메모이제이션)' },
  description: {
    en: 'Top-down DP — cache subresults',
    ko: '하향식 DP — 부분결과 재사용',
  },
  algorithm: 'module:fibonaccimemo',
  projector: 'module:fibonaccimemoProjector',
  initialData: { type: 'integer', n: 8 },
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      { ref: 'inputDisplay' },
      { ref: 'stage' },
      { ref: 'resultDisplay' },
      { ref: 'controls' },
      { ref: 'codePanel' },
    ],
  },
  blocks: {
    header: { type: 'title-block' },
    inputDisplay: { type: 'text-display', label: { en: 'Input', ko: '입력' } },
    stage: { type: 'bar-chart', height: 220 },
    resultDisplay: { type: 'text-display', label: { en: 'Result', ko: '결과' } },
    codePanel: {
      type: 'code-view',
      label: { en: 'Code', ko: '코드' },
      ir: 'ir:fibonaccimemo-imperative',
    },
    controls: {
      type: 'control-bar',
      controls: [{ widget: 'button', action: 'play' }, { widget: 'button', action: 'step' }, { widget: 'button', action: 'pause' }, { widget: 'button', action: 'reset' }, { widget: 'speed-slider', action: 'speed', default: 1 }],
      metrics: [
        { name: 'call-count', label: { en: 'Calls', ko: '호출' }, initial: 0 },
        { name: 'hit-count', label: { en: 'Hits', ko: '캐시' }, initial: 0 },
      ],
    },
  },
};
