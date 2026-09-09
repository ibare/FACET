/**
 * @ffacet/algorithm-dynamic-programming — 동적 계획법 (0/1 배낭) 완결형 facet 번들.
 *
 * algorithm / projector / IR / facet JSON / description / 전용 stage view 를
 * 함께 담고 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다 (S-facet).
 */

export { dynamicProgramming, type DynamicProgrammingData } from './algorithm.js';
export { dynamicProgrammingProjector } from './projector.js';
export { knapsackTableIR, dynamicProgrammingIRs } from './irs.js';
export { dynamicProgrammingFacet } from './facet.js';
export { dynamicProgrammingDescription } from './description.js';
export {
  dynamicProgrammingStageView,
  type DynamicProgrammingCellOrigin,
  type DynamicProgrammingSource,
} from './dynamic-programming-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { dynamicProgramming, type DynamicProgrammingData } from './algorithm.js';
import { dynamicProgrammingProjector } from './projector.js';
import { dynamicProgrammingIRs } from './irs.js';
import { dynamicProgrammingStageView } from './dynamic-programming-stage.js';
import { dynamicProgrammingFacet } from './facet.js';
import { dynamicProgrammingDescription } from './description.js';

/** algorithm / projector / IR / view / facet / description 등록 헬퍼. */
export function registerDynamicProgramming(): void {
  registerAlgorithm<DynamicProgrammingData>('dynamicProgramming', dynamicProgramming);
  registerProjector('dynamicProgrammingProjector', dynamicProgrammingProjector);
  for (const ir of dynamicProgrammingIRs) registerIR(ir.id, ir);
  registerView('dynamic-programming-stage', dynamicProgrammingStageView);
  registerFacets([dynamicProgrammingFacet]);
  registerDescription(dynamicProgrammingFacet.id, dynamicProgrammingDescription);
}
