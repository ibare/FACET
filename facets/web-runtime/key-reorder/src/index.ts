import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { keyReorder } from './algorithm.js';
import { keyReorderScene } from './scene.js';
import { keyReorderIRs } from './irs.js';
import { keyReorderStageView } from './key-reorder-stage.js';
import { keyReorderFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './key-reorder-stage.js';
export * from './facet.js';

export function registerKeyReorder(): void {
  registerAlgorithm('keyReorder', keyReorder, { mechanismKind: 'reactive' });
  registerScenePlan('keyReorderScene', keyReorderScene);
  for (const ir of keyReorderIRs) registerIR(ir.id, ir);
  registerView('key-reorder-stage', keyReorderStageView);
  registerFacets([keyReorderFacet]);
}
