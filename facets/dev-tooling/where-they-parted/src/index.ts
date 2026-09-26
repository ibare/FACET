import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { whereTheyParted, type WhereTheyPartedFacetData } from './algorithm.js';
import { whereTheyPartedScene } from './scene.js';
import { whereTheyPartedStageView } from './where-they-parted-stage.js';
import { whereTheyPartedIRs } from './irs.js';
import { whereTheyPartedFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './where-they-parted-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerWhereTheyParted(): void {
  registerAlgorithm<WhereTheyPartedFacetData>('whereTheyParted', whereTheyParted, { mechanismKind: 'reactive' });
  registerScenePlan('whereTheyPartedScene', whereTheyPartedScene);
  for (const ir of whereTheyPartedIRs) registerIR(ir.id, ir);
  registerView('where-they-parted-stage', whereTheyPartedStageView);
  registerFacets([whereTheyPartedFacet]);
}
