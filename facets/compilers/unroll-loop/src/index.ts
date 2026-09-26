import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { unrollLoop, type UnrollLoopFacetData } from './algorithm.js';
import { unrollLoopScene } from './scene.js';
import { unrollLoopIRs } from './irs.js';
import { unrollLoopStageView } from './unroll-loop-stage.js';
import { unrollLoopFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './unroll-loop-stage.js';
export * from './facet.js';

export function registerUnrollLoop(): void {
  registerAlgorithm<UnrollLoopFacetData>('unrollLoop', unrollLoop, { mechanismKind: 'reactive' });
  registerScenePlan('unrollLoopScene', unrollLoopScene);
  for (const ir of unrollLoopIRs) registerIR(ir.id, ir);
  registerView('unroll-loop-stage', unrollLoopStageView);
  registerFacets([unrollLoopFacet]);
}
