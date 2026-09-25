import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { lostUpdate, type LostUpdateFacetData } from './algorithm.js';
import { lostUpdateScene } from './scene.js';
import { lostUpdateStageView } from './lost-update-stage.js';
import { lostUpdateIRs } from './irs.js';
import { lostUpdateFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './lost-update-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerLostUpdate(): void {
  registerAlgorithm<LostUpdateFacetData>('lostUpdate', lostUpdate, { mechanismKind: 'reactive' });
  registerScenePlan('lostUpdateScene', lostUpdateScene);
  for (const ir of lostUpdateIRs) registerIR(ir.id, ir);
  registerView('lost-update-stage', lostUpdateStageView);
  registerFacets([lostUpdateFacet]);
}
