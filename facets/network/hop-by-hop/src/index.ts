import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { hopByHop, type HopByHopFacetData } from './algorithm.js';
import { hopByHopScene } from './scene.js';
import { hopByHopIRs } from './irs.js';
import { hopByHopStageView } from './hop-by-hop-stage.js';
import { hopByHopFacet } from './facet.js';

export { hopByHop, simulateHops, readHopByHopData } from './algorithm.js';
export type { HopByHopFacetData, HopMove, HopTick } from './algorithm.js';
export { hopByHopScene } from './scene.js';
export type { HopByHopScene, HopStep, HopUse, HopSceneMove } from './scene.js';
export { hopByHopIRs } from './irs.js';
export { hopByHopStageView } from './hop-by-hop-stage.js';
export { hopByHopFacet } from './facet.js';

export function registerHopByHop(): void {
  registerAlgorithm<HopByHopFacetData>('hopByHop', hopByHop, { mechanismKind: 'reactive' });
  registerScenePlan('hopByHopScene', hopByHopScene);
  for (const ir of hopByHopIRs) registerIR(ir.id, ir);
  registerView('hop-by-hop-stage', hopByHopStageView);
  registerFacets([hopByHopFacet]);
}
