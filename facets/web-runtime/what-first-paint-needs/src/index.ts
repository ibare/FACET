import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { whatFirstPaintNeeds } from './algorithm.js';
import { whatFirstPaintNeedsFacet } from './facet.js';
import { whatFirstPaintNeedsIRs } from './irs.js';
import { whatFirstPaintNeedsScene } from './scene.js';
import { whatFirstPaintNeedsStageView } from './what-first-paint-needs-stage.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './what-first-paint-needs-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerWhatFirstPaintNeeds(): void {
  registerAlgorithm('whatFirstPaintNeeds', whatFirstPaintNeeds, { mechanismKind: 'reactive' });
  registerScenePlan('whatFirstPaintNeedsScene', whatFirstPaintNeedsScene);
  for (const ir of whatFirstPaintNeedsIRs) registerIR(ir.id, ir);
  registerView('what-first-paint-needs-stage', whatFirstPaintNeedsStageView);
  registerFacets([whatFirstPaintNeedsFacet]);
}
