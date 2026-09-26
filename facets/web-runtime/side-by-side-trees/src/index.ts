import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { sideBySideTrees } from './algorithm.js';
import { sideBySideTreesScene } from './scene.js';
import { sideBySideTreesStageView } from './side-by-side-trees-stage.js';
import { sideBySideTreesIRs } from './irs.js';
import { sideBySideTreesFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './side-by-side-trees-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerSideBySideTrees(): void {
  registerAlgorithm('sideBySideTrees', sideBySideTrees, { mechanismKind: 'reactive' });
  registerScenePlan('sideBySideTreesScene', sideBySideTreesScene);
  for (const ir of sideBySideTreesIRs) registerIR(ir.id, ir);
  registerView('side-by-side-trees-stage', sideBySideTreesStageView);
  registerFacets([sideBySideTreesFacet]);
}
