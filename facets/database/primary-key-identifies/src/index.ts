import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { primaryKeyIdentifies, type PrimaryKeyIdentifiesFacetData } from './algorithm.js';
import { primaryKeyIdentifiesScene } from './scene.js';
import { primaryKeyIdentifiesIRs } from './irs.js';
import { primaryKeyIdentifiesStageView } from './primary-key-identifies-stage.js';
import { primaryKeyIdentifiesFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './primary-key-identifies-stage.js';
export * from './facet.js';

export function registerPrimaryKeyIdentifies(): void {
  registerAlgorithm<PrimaryKeyIdentifiesFacetData>('primaryKeyIdentifies', primaryKeyIdentifies, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('primaryKeyIdentifiesScene', primaryKeyIdentifiesScene);
  for (const ir of primaryKeyIdentifiesIRs) registerIR(ir.id, ir);
  registerView('primary-key-identifies-stage', primaryKeyIdentifiesStageView);
  registerFacets([primaryKeyIdentifiesFacet]);
}
