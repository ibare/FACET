import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { methodLookupUp, type MethodLookupUpFacetData } from './algorithm.js';
import { methodLookupUpScene } from './scene.js';
import { methodLookupUpStageView } from './method-lookup-up-stage.js';
import { methodLookupUpIRs } from './irs.js';
import { methodLookupUpFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './method-lookup-up-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerMethodLookupUp(): void {
  registerAlgorithm<MethodLookupUpFacetData>('methodLookupUp', methodLookupUp, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('methodLookupUpScene', methodLookupUpScene);
  for (const ir of methodLookupUpIRs) registerIR(ir.id, ir);
  registerView('method-lookup-up-stage', methodLookupUpStageView);
  registerFacets([methodLookupUpFacet]);
}
