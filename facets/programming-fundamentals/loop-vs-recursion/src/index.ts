/**
 * loop-vs-recursion — 등록 진입점. 호스트가 registerLoopVsRecursion() 을 부른다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { loopVsRecursionAlgorithm, type LoopVsRecursionData } from './algorithm.js';
import { loopVsRecursionProjector } from './projector.js';
import { loopVsRecursionIRs } from './irs.js';
import { loopVsRecursionStageView } from './loop-vs-recursion-stage.js';
import { loopVsRecursionFacet } from './facet.js';

export { loopVsRecursionAlgorithm, type LoopVsRecursionData, type LoopVsRecursionRound } from './algorithm.js';
export { loopVsRecursionProjector } from './projector.js';
export { loopVsRecursionImperativeIR, loopVsRecursionIRs } from './irs.js';
export { loopVsRecursionStageView, type LoopVsRecursionStage } from './loop-vs-recursion-stage.js';
export { loopVsRecursionFacet } from './facet.js';

export function registerLoopVsRecursion(): void {
  registerAlgorithm<LoopVsRecursionData>('loopVsRecursion', loopVsRecursionAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('loopVsRecursionProjector', loopVsRecursionProjector);
  for (const ir of loopVsRecursionIRs) registerIR(ir.id, ir);
  registerView('loop-vs-recursion-stage', loopVsRecursionStageView);
  registerFacets([loopVsRecursionFacet]);
}
