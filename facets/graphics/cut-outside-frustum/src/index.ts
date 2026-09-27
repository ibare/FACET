import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { cutOutsideFrustum } from './algorithm.js';
import type { CutOutsideFrustumFacetData } from './algorithm.js';
import { cutOutsideFrustumScene } from './scene.js';
import { cutOutsideFrustumStageView } from './cut-outside-frustum-stage.js';
import { cutOutsideFrustumIRs } from './irs.js';
import { cutOutsideFrustumFacet } from './facet.js';

export { cutOutsideFrustum, narrowCutOutsideFrustumData, planeDistance, toNdc, ndcArea, PLANES } from './algorithm.js';
export type { CutOutsideFrustumFacetData, ClipVertex, PlaneId, Vec4 } from './algorithm.js';
export { cutOutsideFrustumScene } from './scene.js';
export type { CutOutsideFrustumScene, CutStep, NewVertex } from './scene.js';
export { cutOutsideFrustumStageView } from './cut-outside-frustum-stage.js';
export { cutOutsideFrustumIRs } from './irs.js';
export { cutOutsideFrustumFacet } from './facet.js';

export function registerCutOutsideFrustum(): void {
  registerAlgorithm<CutOutsideFrustumFacetData>('cutOutsideFrustum', cutOutsideFrustum, { mechanismKind: 'reactive' });
  registerScenePlan('cutOutsideFrustumScene', cutOutsideFrustumScene);
  for (const ir of cutOutsideFrustumIRs) registerIR(ir.id, ir);
  registerView('cut-outside-frustum-stage', cutOutsideFrustumStageView);
  registerFacets([cutOutsideFrustumFacet]);
}
