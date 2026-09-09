/**
 * bagging-sample 조각의 등록 진입점.
 *
 * `registerBaggingSample()` 을 호출하는 것은 호스트 앱의 몫이다. 이 모듈은
 * import 만으로 아무것도 등록하지 않는다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { baggingSampleAlgorithm, type BaggingSampleData } from './algorithm.js';
import { baggingSampleProjector } from './projector.js';
import { baggingSampleIRs } from './irs.js';
import { baggingSampleStageView } from './bagging-sample-stage.js';
import { baggingSampleFacet } from './facet.js';
import { baggingSampleDescription } from './description.js';

export { baggingSampleAlgorithm, type BaggingSampleData } from './algorithm.js';
export { baggingSampleProjector } from './projector.js';
export { baggingSampleIRs } from './irs.js';
export {
  baggingSampleStageView,
  readBaggingSetup,
  type BaggingSetup,
  type BaggingDrawInput,
  type BaggingLeftOutInput,
} from './bagging-sample-stage.js';
export { baggingSampleFacet } from './facet.js';
export { baggingSampleDescription } from './description.js';

export function registerBaggingSample(): void {
  registerAlgorithm<BaggingSampleData>('baggingSample', baggingSampleAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('baggingSampleProjector', baggingSampleProjector);
  for (const ir of baggingSampleIRs) registerIR(ir.id, ir);
  registerView('bagging-sample-stage', baggingSampleStageView);
  registerFacets([baggingSampleFacet]);
  registerDescription(baggingSampleFacet.id, baggingSampleDescription);
}
