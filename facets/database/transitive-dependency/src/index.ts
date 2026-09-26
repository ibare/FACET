import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { transitiveDependency, type TransitiveDependencyFacetData } from './algorithm.js';
import { transitiveDependencyScene } from './scene.js';
import { transitiveDependencyStageView } from './transitive-dependency-stage.js';
import { transitiveDependencyIRs } from './irs.js';
import { transitiveDependencyFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './transitive-dependency-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerTransitiveDependency(): void {
  registerAlgorithm<TransitiveDependencyFacetData>('transitiveDependency', transitiveDependency, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('transitiveDependencyScene', transitiveDependencyScene);
  for (const ir of transitiveDependencyIRs) registerIR(ir.id, ir);
  registerView('transitive-dependency-stage', transitiveDependencyStageView);
  registerFacets([transitiveDependencyFacet]);
}
