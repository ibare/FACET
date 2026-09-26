import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { phiMerges, type PhiMergesFacetData } from './algorithm.js';
import { phiMergesScene } from './scene.js';
import { phiMergesIRs } from './irs.js';
import { phiMergesStageView } from './phi-merges-stage.js';
import { phiMergesFacet } from './facet.js';

export { phiMerges, type PhiMergesFacetData, type Ins, type Operand, type BinOp } from './algorithm.js';
export { phiMergesScene, type PhiMergesScene } from './scene.js';
export { phiMergesIRs } from './irs.js';
export { phiMergesStageView } from './phi-merges-stage.js';
export { phiMergesFacet } from './facet.js';

export function registerPhiMerges(): void {
  registerAlgorithm<PhiMergesFacetData>('phiMerges', phiMerges, { mechanismKind: 'reactive' });
  registerScenePlan('phiMergesScene', phiMergesScene);
  for (const ir of phiMergesIRs) registerIR(ir.id, ir);
  registerView('phi-merges-stage', phiMergesStageView);
  registerFacets([phiMergesFacet]);
}
