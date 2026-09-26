import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { reorderJoins, type ReorderJoinsFacetData } from './algorithm.js';
import { reorderJoinsFacet } from './facet.js';
import { reorderJoinsIRs } from './irs.js';
import { reorderJoinsScene } from './scene.js';
import { reorderJoinsStageView } from './reorder-joins-stage.js';

export * from './algorithm.js';
export * from './scene.js';
export { reorderJoinsStageView } from './reorder-joins-stage.js';
export { reorderJoinsIRs } from './irs.js';
export { reorderJoinsFacet } from './facet.js';

export function registerReorderJoins(): void {
  registerAlgorithm<ReorderJoinsFacetData>('reorderJoins', reorderJoins, { mechanismKind: 'reactive' });
  registerScenePlan('reorderJoinsScene', reorderJoinsScene);
  for (const ir of reorderJoinsIRs) registerIR(ir.id, ir);
  registerView('reorder-joins-stage', reorderJoinsStageView);
  registerFacets([reorderJoinsFacet]);
}
