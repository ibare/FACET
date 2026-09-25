import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { referenceHoldsAddress, type ReferenceHoldsAddressFacetData } from './algorithm.js';
import { referenceHoldsAddressScene } from './scene.js';
import { referenceHoldsAddressIRs } from './irs.js';
import { referenceHoldsAddressStageView } from './reference-holds-address-stage.js';
import { referenceHoldsAddressFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './reference-holds-address-stage.js';
export * from './facet.js';

export function registerReferenceHoldsAddress(): void {
  registerAlgorithm<ReferenceHoldsAddressFacetData>('referenceHoldsAddress', referenceHoldsAddress, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('referenceHoldsAddressScene', referenceHoldsAddressScene);
  for (const ir of referenceHoldsAddressIRs) registerIR(ir.id, ir);
  registerView('reference-holds-address-stage', referenceHoldsAddressStageView);
  registerFacets([referenceHoldsAddressFacet]);
}
