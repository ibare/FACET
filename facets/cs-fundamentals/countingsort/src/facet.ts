import type { FacetJson } from '@facet/core/runtime';

export const countingsortFacet: FacetJson = {
  id: 'facet:countingSort',
  title: { en: 'Counting Sort', ko: '카운팅 정렬' },
  description: {
    en: 'Non-comparison sort by counting — O(n + k)',
    ko: '값을 세어 정렬 — O(n + k)',
  },
  algorithm: 'module:countingsort',
  projector: 'module:countingsortProjector',
  initialData: { type: 'array', values: [4, 2, 2, 8, 3, 3, 1, 5] },
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
      ir: 'ir:countingsort-imperative',
    },
    controls: {
      type: 'control-bar',
      controls: [{ widget: 'button', action: 'play' }, { widget: 'button', action: 'step' }, { widget: 'button', action: 'pause' }, { widget: 'button', action: 'reset' }, { widget: 'speed-slider', action: 'speed', default: 1 }],
      metrics: [
        { name: 'read-count', label: { en: 'Read', ko: '읽기' }, initial: 0 },
        { name: 'write-count', label: { en: 'Write', ko: '쓰기' }, initial: 0 },
      ],
    },
  },
};
