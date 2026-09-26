import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { typeFlowsUp, type TypeFlowsUpFacetData } from './algorithm.js';
import { typeFlowsUpScene } from './scene.js';
import { typeFlowsUpStageView } from './type-flows-up-stage.js';
import { typeFlowsUpIRs } from './irs.js';
import { typeFlowsUpFacet } from './facet.js';

export * from './algorithm.js';
export { typeFlowsUpScene, layoutLine, TYPE_NAMES } from './scene.js';
export type { TypeFlowsUpScene, Step, NameEntry, Token, NodeShape, LineLayout } from './scene.js';
export { typeFlowsUpStageView } from './type-flows-up-stage.js';
export { typeFlowsUpIRs } from './irs.js';
export { typeFlowsUpFacet } from './facet.js';

export function registerTypeFlowsUp(): void {
  registerAlgorithm<TypeFlowsUpFacetData>('typeFlowsUp', typeFlowsUp, { mechanismKind: 'reactive' });
  registerScenePlan('typeFlowsUpScene', typeFlowsUpScene);
  for (const ir of typeFlowsUpIRs) registerIR(ir.id, ir);
  registerView('type-flows-up-stage', typeFlowsUpStageView);
  registerFacets([typeFlowsUpFacet]);
}
