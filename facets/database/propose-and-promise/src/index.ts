import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { proposeAndPromise, type ProposeAndPromiseFacetData } from './algorithm.js';
import { proposeAndPromiseScene } from './scene.js';
import { proposeAndPromiseStageView } from './propose-and-promise-stage.js';
import { proposeAndPromiseIRs } from './irs.js';
import { proposeAndPromiseFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './propose-and-promise-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerProposeAndPromise(): void {
  registerAlgorithm<ProposeAndPromiseFacetData>('proposeAndPromise', proposeAndPromise, { mechanismKind: 'reactive' });
  registerScenePlan('proposeAndPromiseScene', proposeAndPromiseScene);
  for (const ir of proposeAndPromiseIRs) registerIR(ir.id, ir);
  registerView('propose-and-promise-stage', proposeAndPromiseStageView);
  registerFacets([proposeAndPromiseFacet]);
}
