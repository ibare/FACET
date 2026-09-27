import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { inclusionExclusion, type InclusionExclusionFacetData } from './algorithm.js';
import { inclusionExclusionScene } from './scene.js';
import { inclusionExclusionStageView } from './inclusion-exclusion-stage.js';
import { inclusionExclusionIRs } from './irs.js';
import { inclusionExclusionFacet } from './facet.js';

export {
  inclusionExclusion,
  narrowInclusionExclusionData,
  unionOf,
  type InclusionExclusionFacetData,
  type NamedSet,
} from './algorithm.js';
export {
  inclusionExclusionScene,
  type InclusionExclusionScene,
  type IeBase,
  type IeStep,
  type TallyFrom,
  type Term,
} from './scene.js';
export { inclusionExclusionStageView } from './inclusion-exclusion-stage.js';
export { inclusionExclusionIRs } from './irs.js';
export { inclusionExclusionFacet } from './facet.js';

export function registerInclusionExclusion(): void {
  registerAlgorithm<InclusionExclusionFacetData>('inclusionExclusion', inclusionExclusion, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('inclusionExclusionScene', inclusionExclusionScene);
  for (const ir of inclusionExclusionIRs) registerIR(ir.id, ir);
  registerView('inclusion-exclusion-stage', inclusionExclusionStageView);
  registerFacets([inclusionExclusionFacet]);
}
