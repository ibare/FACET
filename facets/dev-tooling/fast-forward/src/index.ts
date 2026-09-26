import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { fastForward, type FastForwardFacetData } from './algorithm.js';
import { fastForwardScene } from './scene.js';
import { fastForwardStageView } from './fast-forward-stage.js';
import { fastForwardIRs } from './irs.js';
import { fastForwardFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './fast-forward-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerFastForward(): void {
  registerAlgorithm<FastForwardFacetData>('fastForward', fastForward, { mechanismKind: 'reactive' });
  registerScenePlan('fastForwardScene', fastForwardScene);
  for (const ir of fastForwardIRs) registerIR(ir.id, ir);
  registerView('fast-forward-stage', fastForwardStageView);
  registerFacets([fastForwardFacet]);
}
