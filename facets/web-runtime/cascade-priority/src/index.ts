/**
 * cascade-priority — 등록 진입점.
 *
 * `registerCascadePriority()` 는 호스트가 부른다. 이 모듈 스스로는 부르지 않는다.
 */

import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { cascadePriorityAlgorithm } from './algorithm.js';
import { cascadePriorityProjector } from './projector.js';
import { cascadePriorityIRs } from './irs.js';
import { cascadePriorityStageView } from './cascade-priority-stage.js';
import { cascadePriorityFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './cascade-priority-stage.js';
export * from './facet.js';

export function registerCascadePriority(): void {
  registerAlgorithm('cascadePriority', cascadePriorityAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('cascadePriorityProjector', cascadePriorityProjector);
  for (const ir of cascadePriorityIRs) registerIR(ir.id, ir);
  registerView('cascade-priority-stage', cascadePriorityStageView);
  registerFacets([cascadePriorityFacet]);
}
