import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { easyOneWayHardBack, type EasyOneWayHardBackFacetData } from './algorithm.js';
import { easyOneWayHardBackScene } from './scene.js';
import { easyOneWayHardBackStageView } from './easy-one-way-hard-back-stage.js';
import { easyOneWayHardBackIRs } from './irs.js';
import { easyOneWayHardBackFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './easy-one-way-hard-back-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerEasyOneWayHardBack(): void {
  registerAlgorithm<EasyOneWayHardBackFacetData>('easyOneWayHardBack', easyOneWayHardBack, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('easyOneWayHardBackScene', easyOneWayHardBackScene);
  for (const ir of easyOneWayHardBackIRs) registerIR(ir.id, ir);
  registerView('easy-one-way-hard-back-stage', easyOneWayHardBackStageView);
  registerFacets([easyOneWayHardBackFacet]);
}
