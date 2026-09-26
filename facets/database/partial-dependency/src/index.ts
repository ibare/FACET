import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { partialDependency, type PartialDependencyFacetData } from './algorithm.js';
import { partialDependencyScene } from './scene.js';
import { partialDependencyStageView } from './partial-dependency-stage.js';
import { partialDependencyIRs } from './irs.js';
import { partialDependencyFacet } from './facet.js';

export { partialDependency, type PartialDependencyFacetData, type PartialDependencyFd } from './algorithm.js';
export {
  partialDependencyScene,
  type PartialDependencyScene,
  type PdStep,
  type PdDep,
  type PdSplit,
  type PdBroken,
} from './scene.js';
export { partialDependencyStageView } from './partial-dependency-stage.js';
export { partialDependencyIRs } from './irs.js';
export { partialDependencyFacet } from './facet.js';

export function registerPartialDependency(): void {
  registerAlgorithm<PartialDependencyFacetData>('partialDependency', partialDependency, { mechanismKind: 'reactive' });
  registerScenePlan('partialDependencyScene', partialDependencyScene);
  for (const ir of partialDependencyIRs) registerIR(ir.id, ir);
  registerView('partial-dependency-stage', partialDependencyStageView);
  registerFacets([partialDependencyFacet]);
}
