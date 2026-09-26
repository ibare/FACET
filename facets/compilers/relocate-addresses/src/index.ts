import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { relocateAddresses, type RelocateAddressesFacetData } from './algorithm.js';
import { relocateAddressesScene } from './scene.js';
import { relocateAddressesIRs } from './irs.js';
import { relocateAddressesStageView } from './relocate-addresses-stage.js';
import { relocateAddressesFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './relocate-addresses-stage.js';
export * from './facet.js';

export function registerRelocateAddresses(): void {
  registerAlgorithm<RelocateAddressesFacetData>('relocateAddresses', relocateAddresses, { mechanismKind: 'reactive' });
  registerScenePlan('relocateAddressesScene', relocateAddressesScene);
  for (const ir of relocateAddressesIRs) registerIR(ir.id, ir);
  registerView('relocate-addresses-stage', relocateAddressesStageView);
  registerFacets([relocateAddressesFacet]);
}
