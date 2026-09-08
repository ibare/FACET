/**
 * @ffacet/algorithm-sift-up — 상향 재배치 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 다섯 걸음을 자동 재생하고 정지하며, 다시 보기
 * 버튼과 한 걸음씩 짚어 보는 버튼 외에는 조작을 받지 않는다.
 */

export { siftUpAlgorithm, type SiftUpData } from './algorithm.js';
export { siftUpProjector } from './projector.js';
export { siftUpIRs } from './irs.js';
export { siftUpFacet } from './facet.js';
export { siftUpDescription } from './description.js';
export { siftUpStageView } from './sift-up-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { siftUpAlgorithm, type SiftUpData } from './algorithm.js';
import { siftUpProjector } from './projector.js';
import { siftUpIRs } from './irs.js';
import { siftUpFacet } from './facet.js';
import { siftUpDescription } from './description.js';
import { siftUpStageView } from './sift-up-stage.js';

export function registerSiftUp(): void {
  registerAlgorithm<SiftUpData>('siftUp', siftUpAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('siftUpProjector', siftUpProjector);
  for (const ir of siftUpIRs) registerIR(ir.id, ir);
  registerView('sift-up-stage', siftUpStageView);
  registerFacets([siftUpFacet]);
  registerDescription(siftUpFacet.id, siftUpDescription);
}
