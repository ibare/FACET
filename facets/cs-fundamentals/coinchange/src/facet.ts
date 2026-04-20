import type { FacetJson } from '@facet/core/runtime';

export const coinchangeFacet: FacetJson = {
  id: 'facet:coinChange',
  title: { en: 'Coin Change (Greedy)', ko: '동전 거스름돈 (그리디)' },
  description: {
    en: 'Pick the largest coin first',
    ko: '큰 동전부터 욕심껏 선택',
  },
  algorithm: 'module:coinchange',
  projector: 'module:coinchangeProjector',
  initialData: { type: 'coins', amount: 47, coins: [25, 10, 5, 1] },
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      { ref: 'remainingDisplay' },
      { ref: 'stage' },
      { ref: 'totalDisplay' },
      { ref: 'controls' },
      { ref: 'codePanel' },
    ],
  },
  blocks: {
    header: { type: 'title-block' },
    remainingDisplay: { type: 'text-display', label: { en: 'Status', ko: '상태' } },
    stage: { type: 'bar-chart', height: 220 },
    totalDisplay: { type: 'text-display', label: { en: 'Total', ko: '합계' } },
    codePanel: {
      type: 'code-view',
      label: { en: 'Code', ko: '코드' },
      ir: 'ir:coinchange-imperative',
    },
    controls: {
      type: 'control-bar',
      controls: ['play', 'step', 'pause', 'reset', { type: 'speed-slider', default: 1 }],
      metrics: [
        { name: 'try-count', label: { en: 'Try', ko: '시도' }, initial: 0 },
        { name: 'coin-count', label: { en: 'Coins', ko: '동전' }, initial: 0 },
      ],
    },
  },
};
