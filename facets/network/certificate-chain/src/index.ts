import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { certificateChain, type CertificateChainFacetData } from './algorithm.js';
import { certificateChainScene } from './scene.js';
import { certificateChainStageView } from './certificate-chain-stage.js';
import { certificateChainIRs } from './irs.js';
import { certificateChainFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './certificate-chain-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerCertificateChain(): void {
  registerAlgorithm<CertificateChainFacetData>('certificateChain', certificateChain, { mechanismKind: 'reactive' });
  registerScenePlan('certificateChainScene', certificateChainScene);
  for (const ir of certificateChainIRs) registerIR(ir.id, ir);
  registerView('certificate-chain-stage', certificateChainStageView);
  registerFacets([certificateChainFacet]);
}
