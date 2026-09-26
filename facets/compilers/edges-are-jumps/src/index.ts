import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { edgesAreJumps, type EdgesAreJumpsFacetData } from './algorithm.js';
import { edgesAreJumpsScene } from './scene.js';
import { edgesAreJumpsIRs } from './irs.js';
import { edgesAreJumpsStageView } from './edges-are-jumps-stage.js';
import { edgesAreJumpsFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './edges-are-jumps-stage.js';
export * from './facet.js';

export function registerEdgesAreJumps(): void {
  registerAlgorithm<EdgesAreJumpsFacetData>('edgesAreJumps', edgesAreJumps, { mechanismKind: 'reactive' });
  registerScenePlan('edgesAreJumpsScene', edgesAreJumpsScene);
  for (const ir of edgesAreJumpsIRs) registerIR(ir.id, ir);
  registerView('edges-are-jumps-stage', edgesAreJumpsStageView);
  registerFacets([edgesAreJumpsFacet]);
}
