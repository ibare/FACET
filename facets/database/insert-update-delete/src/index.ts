import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { insertUpdateDelete, type InsertUpdateDeleteFacetData } from './algorithm.js';
import { insertUpdateDeleteScene } from './scene.js';
import { insertUpdateDeleteStageView } from './insert-update-delete-stage.js';
import { insertUpdateDeleteIRs } from './irs.js';
import { insertUpdateDeleteFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './insert-update-delete-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerInsertUpdateDelete(): void {
  registerAlgorithm<InsertUpdateDeleteFacetData>('insertUpdateDelete', insertUpdateDelete, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('insertUpdateDeleteScene', insertUpdateDeleteScene);
  for (const ir of insertUpdateDeleteIRs) registerIR(ir.id, ir);
  registerView('insert-update-delete-stage', insertUpdateDeleteStageView);
  registerFacets([insertUpdateDeleteFacet]);
}
