import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { diamondDependency, type DiamondDependencyFacetData } from './algorithm.js';
import { diamondDependencyScene } from './scene.js';
import { diamondDependencyIRs } from './irs.js';
import { diamondDependencyStageView } from './diamond-dependency-stage.js';
import { diamondDependencyFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './diamond-dependency-stage.js';
export * from './facet.js';

export function registerDiamondDependency(): void {
  registerAlgorithm<DiamondDependencyFacetData>('diamondDependency', diamondDependency, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('diamondDependencyScene', diamondDependencyScene);
  for (const ir of diamondDependencyIRs) registerIR(ir.id, ir);
  registerView('diamond-dependency-stage', diamondDependencyStageView);
  registerFacets([diamondDependencyFacet]);
}
