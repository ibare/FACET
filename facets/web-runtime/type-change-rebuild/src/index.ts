import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';

import { typeChangeRebuild } from './algorithm.js';
import { typeChangeRebuildFacet } from './facet.js';
import { typeChangeRebuildIRs } from './irs.js';
import { typeChangeRebuildScene } from './scene.js';
import { typeChangeRebuildStageView } from './type-change-rebuild-stage.js';

export * from './algorithm.js';
export * from './facet.js';
export * from './irs.js';
export * from './scene.js';
export * from './type-change-rebuild-stage.js';

export function registerTypeChangeRebuild(): void {
  registerAlgorithm('typeChangeRebuild', typeChangeRebuild, { mechanismKind: 'reactive' });
  registerScenePlan('typeChangeRebuildScene', typeChangeRebuildScene);
  for (const ir of typeChangeRebuildIRs) registerIR(ir.id, ir);
  registerView('type-change-rebuild-stage', typeChangeRebuildStageView);
  registerFacets([typeChangeRebuildFacet]);
}
