import type { FacetJson } from '@facet/core/runtime';

export const shellsortFacet: FacetJson = {
  id: 'facet:shellSort',
  title: { en: 'Shell Sort', ko: '셸 정렬' },
  description: {
    en: 'Gapped insertion sort — gap sequence reduces to 1',
    ko: '간격 인서션 정렬 — 간격이 1 까지 줄어듦',
  },
  algorithm: 'module:shellsort',
  projector: 'module:shellsortProjector',
  initialData: { type: 'array', values: [5, 2, 8, 1, 9, 3, 7, 4] },
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
      ir: 'ir:shellsort-imperative',
    },
    controls: {
      type: 'control-bar',
      controls: [{ widget: 'button', action: 'play' }, { widget: 'button', action: 'step' }, { widget: 'button', action: 'pause' }, { widget: 'button', action: 'reset' }, { widget: 'speed-slider', action: 'speed', default: 1 }],
      metrics: [
        { name: 'compare-count', label: { en: 'Compare', ko: '비교' }, initial: 0 },
        { name: 'shift-count', label: { en: 'Shift', ko: '이동' }, initial: 0 },
      ],
    },
  },
};
