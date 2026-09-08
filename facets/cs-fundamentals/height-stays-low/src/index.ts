/**
 * @ffacet/algorithm-height-stays-low — 낮은 트리 높이 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 두 나무가 같은 목표 잎 수를 각자 덮어 나가는
 * 걸음을 자동 재생하고 정지하며, 다시 보기와 한 걸음(advance) 외에는 조작을
 * 받지 않는다.
 */

export {
  heightStaysLow,
  type HeightStaysLowData,
} from './algorithm.js';
export { heightStaysLowProjector } from './projector.js';
export { heightStaysLowIRs } from './irs.js';
export { heightStaysLowFacet } from './facet.js';
export { heightStaysLowDescription } from './description.js';
export { heightStaysLowStageView } from './height-stays-low-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { heightStaysLow, type HeightStaysLowData } from './algorithm.js';
import { heightStaysLowProjector } from './projector.js';
import { heightStaysLowIRs } from './irs.js';
import { heightStaysLowFacet } from './facet.js';
import { heightStaysLowDescription } from './description.js';
import { heightStaysLowStageView } from './height-stays-low-stage.js';

export function registerHeightStaysLow(): void {
  registerAlgorithm<HeightStaysLowData>('heightStaysLow', heightStaysLow, {
    mechanismKind: 'reactive',
  });
  registerProjector('heightStaysLowProjector', heightStaysLowProjector);
  for (const ir of heightStaysLowIRs) registerIR(ir.id, ir);
  registerView('height-stays-low-stage', heightStaysLowStageView);
  registerFacets([heightStaysLowFacet]);
  registerDescription(heightStaysLowFacet.id, heightStaysLowDescription);
}
