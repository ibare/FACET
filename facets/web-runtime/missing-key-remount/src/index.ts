import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';

import { missingKeyRemount, type MissingKeyRemountFacetData } from './algorithm.js';
import { missingKeyRemountFacet } from './facet.js';
import { missingKeyRemountIRs } from './irs.js';
import { missingKeyRemountScene } from './scene.js';
import { missingKeyRemountStageView } from './missing-key-remount-stage.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './missing-key-remount-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerMissingKeyRemount(): void {
  registerAlgorithm<MissingKeyRemountFacetData>('missingKeyRemount', missingKeyRemount, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('missingKeyRemountScene', missingKeyRemountScene);
  for (const ir of missingKeyRemountIRs) registerIR(ir.id, ir);
  registerView('missing-key-remount-stage', missingKeyRemountStageView);
  registerFacets([missingKeyRemountFacet]);
}
