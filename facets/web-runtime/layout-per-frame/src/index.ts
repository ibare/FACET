import { registerAlgorithm, registerScenePlan, registerIR, registerView, registerFacets } from '@ffacet/core/runtime';
import { layoutPerFrame } from './algorithm.js';
import { layoutPerFrameScene } from './scene.js';
import { layoutPerFrameIRs } from './irs.js';
import { layoutPerFrameFacet } from './facet.js';
import { layoutPerFrameStageView } from './layout-per-frame-stage.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './facet.js';
export * from './layout-per-frame-stage.js';

export function registerLayoutPerFrame(): void {
  registerAlgorithm('layoutPerFrame', layoutPerFrame, { mechanismKind: 'reactive' });
  registerScenePlan('layoutPerFrameScene', layoutPerFrameScene);
  for (const ir of layoutPerFrameIRs) registerIR(ir.id, ir);
  registerView('layout-per-frame-stage', layoutPerFrameStageView);
  registerFacets([layoutPerFrameFacet]);
}
