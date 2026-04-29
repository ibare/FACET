/**
 * 더미 counter facet JSON — TS 로 표현 (import 편의).
 */

import type { FacetJson } from '../../types/facet-json.js';

export const counterFacet: FacetJson = {
  id: 'facet:counter',
  title: '카운터 (더미)',
  description: '1부터 N까지 세는 검증용 시각화',
  algorithm: 'module:counter',
  projector: 'module:counterProjector',
  initialData: { type: 'counter', target: 5 },
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      { ref: 'display', grow: 1 },
      { ref: 'controls' },
    ],
  },
  blocks: {
    header: { type: 'title-block' },
    display: { type: 'text-display', label: '현재 값' },
    controls: {
      type: 'control-bar',
      controls: [{ widget: 'button', action: 'play' }, { widget: 'button', action: 'step' }, { widget: 'button', action: 'pause' }, { widget: 'button', action: 'reset' }, { widget: 'speed-slider', action: 'speed', default: 1 }],
      metrics: [{ name: 'count', label: '카운트', initial: 0 }],
    },
  },
};
