import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { functionAsValue, type FunctionAsValueFacetData } from './algorithm.js';
import { functionAsValueScene } from './scene.js';
import { functionAsValueStageView } from './function-as-value-stage.js';
import { functionAsValueIRs } from './irs.js';
import { functionAsValueFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { functionAsValueStageView } from './function-as-value-stage.js';
export { functionAsValueIRs } from './irs.js';
export { functionAsValueFacet } from './facet.js';

export function registerFunctionAsValue(): void {
  registerAlgorithm<FunctionAsValueFacetData>('functionAsValue', functionAsValue, { mechanismKind: 'reactive' });
  registerScenePlan('functionAsValueScene', functionAsValueScene);
  for (const ir of functionAsValueIRs) registerIR(ir.id, ir);
  registerView('function-as-value-stage', functionAsValueStageView);
  registerFacets([functionAsValueFacet]);
}
