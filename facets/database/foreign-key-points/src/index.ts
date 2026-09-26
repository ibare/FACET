import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { foreignKeyPoints, type ForeignKeyPointsFacetData } from './algorithm.js';
import { foreignKeyPointsScene } from './scene.js';
import { foreignKeyPointsIRs } from './irs.js';
import { foreignKeyPointsStageView } from './foreign-key-points-stage.js';
import { foreignKeyPointsFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './foreign-key-points-stage.js';
export * from './facet.js';

export function registerForeignKeyPoints(): void {
  registerAlgorithm<ForeignKeyPointsFacetData>('foreignKeyPoints', foreignKeyPoints, { mechanismKind: 'reactive' });
  registerScenePlan('foreignKeyPointsScene', foreignKeyPointsScene);
  for (const ir of foreignKeyPointsIRs) registerIR(ir.id, ir);
  registerView('foreign-key-points-stage', foreignKeyPointsStageView);
  registerFacets([foreignKeyPointsFacet]);
}
