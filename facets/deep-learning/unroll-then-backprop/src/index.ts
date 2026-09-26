import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { unrollThenBackprop, type UnrollThenBackpropFacetData } from './algorithm.js';
import { unrollThenBackpropScene } from './scene.js';
import { unrollThenBackpropStageView } from './unroll-then-backprop-stage.js';
import { unrollThenBackpropIRs } from './irs.js';
import { unrollThenBackpropFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './unroll-then-backprop-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerUnrollThenBackprop(): void {
  registerAlgorithm<UnrollThenBackpropFacetData>('unrollThenBackprop', unrollThenBackprop, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('unrollThenBackpropScene', unrollThenBackpropScene);
  for (const ir of unrollThenBackpropIRs) registerIR(ir.id, ir);
  registerView('unroll-then-backprop-stage', unrollThenBackpropStageView);
  registerFacets([unrollThenBackpropFacet]);
}
