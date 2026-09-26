import { registerAlgorithm, registerScenePlan, registerIR, registerView, registerFacets } from '@ffacet/core/runtime';
import { framesStackUp } from './algorithm.js';
import { framesStackUpScene } from './scene.js';
import { framesStackUpIRs } from './irs.js';
import { framesStackUpStageView } from './frames-stack-up-stage.js';
import { framesStackUpFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './frames-stack-up-stage.js';
export * from './facet.js';

export function registerFramesStackUp(): void {
  registerAlgorithm('framesStackUp', framesStackUp, { mechanismKind: 'reactive' });
  registerScenePlan('framesStackUpScene', framesStackUpScene);
  for (const ir of framesStackUpIRs) registerIR(ir.id, ir);
  registerView('frames-stack-up-stage', framesStackUpStageView);
  registerFacets([framesStackUpFacet]);
}
