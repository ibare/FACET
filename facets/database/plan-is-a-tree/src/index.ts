import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { planIsATree, type PlanIsATreeFacetData } from './algorithm.js';
import { planIsATreeScene } from './scene.js';
import { planIsATreeStageView } from './plan-is-a-tree-stage.js';
import { planIsATreeIRs } from './irs.js';
import { planIsATreeFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './plan-is-a-tree-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerPlanIsATree(): void {
  registerAlgorithm<PlanIsATreeFacetData>('planIsATree', planIsATree, { mechanismKind: 'reactive' });
  registerScenePlan('planIsATreeScene', planIsATreeScene);
  for (const ir of planIsATreeIRs) registerIR(ir.id, ir);
  registerView('plan-is-a-tree-stage', planIsATreeStageView);
  registerFacets([planIsATreeFacet]);
}
