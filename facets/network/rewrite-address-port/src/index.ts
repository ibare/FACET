import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { rewriteAddressPort, type RewriteAddressPortFacetData } from './algorithm.js';
import { rewriteAddressPortScene } from './scene.js';
import { rewriteAddressPortStageView } from './rewrite-address-port-stage.js';
import { rewriteAddressPortIRs } from './irs.js';
import { rewriteAddressPortFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './rewrite-address-port-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerRewriteAddressPort(): void {
  registerAlgorithm<RewriteAddressPortFacetData>('rewriteAddressPort', rewriteAddressPort, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('rewriteAddressPortScene', rewriteAddressPortScene);
  for (const ir of rewriteAddressPortIRs) registerIR(ir.id, ir);
  registerView('rewrite-address-port-stage', rewriteAddressPortStageView);
  registerFacets([rewriteAddressPortFacet]);
}
