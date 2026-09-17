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
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { baggingSampleAlgorithm, type BaggingSampleData } from './algorithm.js';
import { baggingSampleIRs } from './irs.js';
import { baggingSampleScene } from './scene.js';
import { baggingSampleStageView } from './bagging-sample-stage.js';
import { baggingSampleFacet } from './facet.js';
import { baggingSampleDescription } from './description.js';

export {
  baggingSampleAlgorithm,
  neverDrawnProbability,
  type BaggingSampleData,
} from './algorithm.js';
export { baggingSampleIRs } from './irs.js';
export { baggingSampleScene } from './scene.js';
export type {
  BaggingCaption,
  BaggingSampleScene,
  BaggingStep,
} from './scene.js';
export { baggingSampleStageView } from './bagging-sample-stage.js';
export { baggingSampleFacet } from './facet.js';
export { baggingSampleDescription } from './description.js';

export function registerBaggingSample(): void {
  registerAlgorithm<BaggingSampleData>('baggingSample', baggingSampleAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('baggingSampleScene', baggingSampleScene);
  for (const ir of baggingSampleIRs) registerIR(ir.id, ir);
  registerView('bagging-sample-stage', baggingSampleStageView);
  registerFacets([baggingSampleFacet]);
  registerDescription(baggingSampleFacet.id, baggingSampleDescription);
}
