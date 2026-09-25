import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { valueInPlace, type ValueInPlaceFacetData } from './algorithm.js';
import { valueInPlaceScene } from './scene.js';
import { valueInPlaceIRs } from './irs.js';
import { valueInPlaceStageView } from './value-in-place-stage.js';
import { valueInPlaceFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './value-in-place-stage.js';
export * from './facet.js';

export function registerValueInPlace(): void {
  registerAlgorithm<ValueInPlaceFacetData>('valueInPlace', valueInPlace, { mechanismKind: 'reactive' });
  registerScenePlan('valueInPlaceScene', valueInPlaceScene);
  for (const ir of valueInPlaceIRs) registerIR(ir.id, ir);
  registerView('value-in-place-stage', valueInPlaceStageView);
  registerFacets([valueInPlaceFacet]);
}
