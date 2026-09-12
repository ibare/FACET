/**
 * bit-mask 조각의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 등록하지 않는다 — 부르는 책임은 호스트 앱에 있다
 * (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { bitMaskAlgorithm, type BitMaskData } from './algorithm.js';
import { bitMaskStageView } from './bit-mask-stage.js';
import { bitMaskDescription } from './description.js';
import { bitMaskFacet } from './facet.js';
import { bitMaskIRs } from './irs.js';
import { bitMaskProjector } from './projector.js';

export { bitMaskAlgorithm, type BitMaskData } from './algorithm.js';
export { bitMaskStageView } from './bit-mask-stage.js';
export { bitMaskDescription } from './description.js';
export { bitMaskFacet } from './facet.js';
export { bitMaskIRs } from './irs.js';
export { bitMaskProjector } from './projector.js';

export function registerBitMask(): void {
  registerAlgorithm<BitMaskData>('bitMask', bitMaskAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('bitMaskProjector', bitMaskProjector);
  for (const ir of bitMaskIRs) registerIR(ir.id, ir);
  registerView('bit-mask-stage', bitMaskStageView);
  registerFacets([bitMaskFacet]);
  registerDescription(bitMaskFacet.id, bitMaskDescription);
}
