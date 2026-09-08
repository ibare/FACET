/**
 * @ffacet/algorithm-black-height-equal — 흑색 높이 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 네 경로를 자동 재생하고 멈추며, 다시 보기와
 * 한 걸음(advance) 외에는 조작을 받지 않는다.
 */

export {
  blackHeightEqual,
  type BlackHeightEqualData,
  type RBColor,
  type RBNode,
} from './algorithm.js';
export { blackHeightEqualProjector } from './projector.js';
export { blackHeightEqualIRs } from './irs.js';
export { blackHeightEqualFacet } from './facet.js';
export { blackHeightEqualDescription } from './description.js';
export { blackHeightEqualStageView } from './black-height-equal-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { blackHeightEqual, type BlackHeightEqualData } from './algorithm.js';
import { blackHeightEqualProjector } from './projector.js';
import { blackHeightEqualIRs } from './irs.js';
import { blackHeightEqualFacet } from './facet.js';
import { blackHeightEqualDescription } from './description.js';
import { blackHeightEqualStageView } from './black-height-equal-stage.js';

export function registerBlackHeightEqual(): void {
  registerAlgorithm<BlackHeightEqualData>('blackHeightEqual', blackHeightEqual, {
    mechanismKind: 'reactive',
  });
  registerProjector('blackHeightEqualProjector', blackHeightEqualProjector);
  for (const ir of blackHeightEqualIRs) registerIR(ir.id, ir);
  registerView('black-height-equal-stage', blackHeightEqualStageView);
  registerFacets([blackHeightEqualFacet]);
  registerDescription(blackHeightEqualFacet.id, blackHeightEqualDescription);
}
