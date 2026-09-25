import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { allocateAndFreeAlgorithm, type AllocateAndFreeData } from './algorithm.js';
import { allocateAndFreeProjector } from './projector.js';
import { allocateAndFreeIRs } from './irs.js';
import { allocateAndFreeStageView } from './allocate-and-free-stage.js';
import { allocateAndFreeFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './allocate-and-free-stage.js';
export * from './facet.js';

/** 알고리즘 · projector · IR · 무대 · 선언을 등록한다. 손잡이가 있어 reactive 로 등록한다 */
export function registerAllocateAndFree(): void {
  registerAlgorithm<AllocateAndFreeData>('allocateAndFree', allocateAndFreeAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('allocateAndFreeProjector', allocateAndFreeProjector);
  for (const ir of allocateAndFreeIRs) registerIR(ir.id, ir);
  registerView('allocate-and-free-stage', allocateAndFreeStageView);
  registerFacets([allocateAndFreeFacet]);
}
