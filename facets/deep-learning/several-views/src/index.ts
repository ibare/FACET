import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { severalViews, type SeveralViewsFacetData } from './algorithm.js';
import { severalViewsScene } from './scene.js';
import { severalViewsIRs } from './irs.js';
import { severalViewsStageView } from './several-views-stage.js';
import { severalViewsFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './several-views-stage.js';
export * from './facet.js';

export function registerSeveralViews(): void {
  registerAlgorithm<SeveralViewsFacetData>('severalViews', severalViews, { mechanismKind: 'reactive' });
  registerScenePlan('severalViewsScene', severalViewsScene);
  for (const ir of severalViewsIRs) registerIR(ir.id, ir);
  registerView('several-views-stage', severalViewsStageView);
  registerFacets([severalViewsFacet]);
}
