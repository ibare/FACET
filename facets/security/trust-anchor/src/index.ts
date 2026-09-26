import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { trustAnchor, type TrustAnchorFacetData } from './algorithm.js';
import { trustAnchorScene } from './scene.js';
import { trustAnchorIRs } from './irs.js';
import { trustAnchorStageView } from './trust-anchor-stage.js';
import { trustAnchorFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { trustAnchorIRs } from './irs.js';
export { trustAnchorStageView } from './trust-anchor-stage.js';
export { trustAnchorFacet } from './facet.js';

export function registerTrustAnchor(): void {
  registerAlgorithm<TrustAnchorFacetData>('trustAnchor', trustAnchor, { mechanismKind: 'reactive' });
  registerScenePlan('trustAnchorScene', trustAnchorScene);
  for (const ir of trustAnchorIRs) registerIR(ir.id, ir);
  registerView('trust-anchor-stage', trustAnchorStageView);
  registerFacets([trustAnchorFacet]);
}
