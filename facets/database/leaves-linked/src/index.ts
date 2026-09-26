import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { leavesLinked, type LeavesLinkedFacetData } from './algorithm.js';
import { leavesLinkedScene } from './scene.js';
import { leavesLinkedStageView } from './leaves-linked-stage.js';
import { leavesLinkedIRs } from './irs.js';
import { leavesLinkedFacet } from './facet.js';

export { leavesLinked, type LeavesLinkedFacetData } from './algorithm.js';
export { leavesLinkedScene, type LeavesLinkedScene } from './scene.js';
export { leavesLinkedStageView } from './leaves-linked-stage.js';
export { leavesLinkedIRs } from './irs.js';
export { leavesLinkedFacet } from './facet.js';

export function registerLeavesLinked(): void {
  registerAlgorithm<LeavesLinkedFacetData>('leavesLinked', leavesLinked, { mechanismKind: 'reactive' });
  registerScenePlan('leavesLinkedScene', leavesLinkedScene);
  for (const ir of leavesLinkedIRs) registerIR(ir.id, ir);
  registerView('leaves-linked-stage', leavesLinkedStageView);
  registerFacets([leavesLinkedFacet]);
}
