import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { dirtyRead, type DirtyReadFacetData } from './algorithm.js';
import { dirtyReadScene } from './scene.js';
import { dirtyReadIRs } from './irs.js';
import { dirtyReadStageView } from './dirty-read-stage.js';
import { dirtyReadFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './dirty-read-stage.js';
export * from './facet.js';

export function registerDirtyRead(): void {
  registerAlgorithm<DirtyReadFacetData>('dirtyRead', dirtyRead, { mechanismKind: 'reactive' });
  registerScenePlan('dirtyReadScene', dirtyReadScene);
  for (const ir of dirtyReadIRs) registerIR(ir.id, ir);
  registerView('dirty-read-stage', dirtyReadStageView);
  registerFacets([dirtyReadFacet]);
}
