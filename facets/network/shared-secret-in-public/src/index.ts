import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { sharedSecretInPublic, type SharedSecretInPublicFacetData } from './algorithm.js';
import { sharedSecretInPublicScene } from './scene.js';
import { sharedSecretInPublicIRs } from './irs.js';
import { sharedSecretInPublicStageView } from './shared-secret-in-public-stage.js';
import { sharedSecretInPublicFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './shared-secret-in-public-stage.js';
export * from './facet.js';

export function registerSharedSecretInPublic(): void {
  registerAlgorithm<SharedSecretInPublicFacetData>('sharedSecretInPublic', sharedSecretInPublic, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('sharedSecretInPublicScene', sharedSecretInPublicScene);
  for (const ir of sharedSecretInPublicIRs) registerIR(ir.id, ir);
  registerView('shared-secret-in-public-stage', sharedSecretInPublicStageView);
  registerFacets([sharedSecretInPublicFacet]);
}
