/**
 * height-balance-check — FacetJson 선언. 로직 없음, 선언만 (S-facet).
 *
 * @piece
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const heightBalanceCheckFacet: FacetJson = {
  id: 'facet:heightBalanceCheck',
  title: { en: 'Height Balance Check', ko: '균형 인수' },
  algorithm: 'module:heightBalanceCheck',
  projector: 'module:heightBalanceCheckProjector',
  initialData: {
    type: 'height-balance-check',
    stepMs: 680,
    root: {
      value: 30,
      left: {
        value: 20,
        left: { value: 10 },
      },
      right: {
        value: 40,
        right: {
          value: 50,
          right: { value: 60 },
        },
      },
    },
  },
  blocks: {
    stage: { type: 'height-balance-check-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
