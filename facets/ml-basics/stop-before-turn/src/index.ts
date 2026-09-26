import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { stopBeforeTurn, type StopBeforeTurnFacetData } from './algorithm.js';
import { stopBeforeTurnScene } from './scene.js';
import { stopBeforeTurnStageView } from './stop-before-turn-stage.js';
import { stopBeforeTurnIRs } from './irs.js';
import { stopBeforeTurnFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './stop-before-turn-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerStopBeforeTurn(): void {
  registerAlgorithm<StopBeforeTurnFacetData>('stopBeforeTurn', stopBeforeTurn, { mechanismKind: 'reactive' });
  registerScenePlan('stopBeforeTurnScene', stopBeforeTurnScene);
  for (const ir of stopBeforeTurnIRs) registerIR(ir.id, ir);
  registerView('stop-before-turn-stage', stopBeforeTurnStageView);
  registerFacets([stopBeforeTurnFacet]);
}
