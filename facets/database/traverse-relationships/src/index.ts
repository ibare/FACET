import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { traverseRelationships, type TraverseRelationshipsFacetData } from './algorithm.js';
import { traverseRelationshipsScene } from './scene.js';
import { traverseRelationshipsIRs } from './irs.js';
import { traverseRelationshipsStageView } from './traverse-relationships-stage.js';
import { traverseRelationshipsFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './traverse-relationships-stage.js';
export * from './facet.js';

export function registerTraverseRelationships(): void {
  registerAlgorithm<TraverseRelationshipsFacetData>('traverseRelationships', traverseRelationships, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('traverseRelationshipsScene', traverseRelationshipsScene);
  for (const ir of traverseRelationshipsIRs) registerIR(ir.id, ir);
  registerView('traverse-relationships-stage', traverseRelationshipsStageView);
  registerFacets([traverseRelationshipsFacet]);
}
