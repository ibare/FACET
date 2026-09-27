import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { secantToTangent, type SecantToTangentFacetData } from './algorithm.js';
import { secantToTangentScene } from './scene.js';
import { secantToTangentIRs } from './irs.js';
import { secantToTangentStageView } from './secant-to-tangent-stage.js';
import { secantToTangentFacet } from './facet.js';

export {
  secantToTangent,
  narrowSecantToTangentData,
  evalTerms,
  differentiate,
  formatTerms,
  type SecantToTangentFacetData,
  type Term,
  type PathSample,
} from './algorithm.js';
export {
  secantToTangentScene,
  type SecantToTangentScene,
  type SecantBase,
  type SecantLine,
  type SecantStep,
} from './scene.js';
export { secantToTangentIRs } from './irs.js';
export { secantToTangentStageView } from './secant-to-tangent-stage.js';
export { secantToTangentFacet } from './facet.js';

export function registerSecantToTangent(): void {
  registerAlgorithm<SecantToTangentFacetData>('secantToTangent', secantToTangent, { mechanismKind: 'reactive' });
  registerScenePlan('secantToTangentScene', secantToTangentScene);
  for (const ir of secantToTangentIRs) registerIR(ir.id, ir);
  registerView('secant-to-tangent-stage', secantToTangentStageView);
  registerFacets([secantToTangentFacet]);
}
