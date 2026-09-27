import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { euclidGcd, type EuclidGcdFacetData } from './algorithm.js';
import { euclidGcdScene } from './scene.js';
import { euclidGcdStageView } from './euclid-gcd-stage.js';
import { euclidGcdIRs } from './irs.js';
import { euclidGcdFacet } from './facet.js';

export { euclidGcd, readEuclidGcdData, divisorsOf, commonOf, type EuclidGcdFacetData } from './algorithm.js';
export { euclidGcdScene, isStopped, type EuclidGcdScene, type EuclidGcdStep, type EuclidGcdLists, type Side } from './scene.js';
export { euclidGcdStageView } from './euclid-gcd-stage.js';
export { euclidGcdIRs } from './irs.js';
export { euclidGcdFacet } from './facet.js';

export function registerEuclidGcd(): void {
  registerAlgorithm<EuclidGcdFacetData>('euclidGcd', euclidGcd, { mechanismKind: 'reactive' });
  registerScenePlan('euclidGcdScene', euclidGcdScene);
  for (const ir of euclidGcdIRs) registerIR(ir.id, ir);
  registerView('euclid-gcd-stage', euclidGcdStageView);
  registerFacets([euclidGcdFacet]);
}
