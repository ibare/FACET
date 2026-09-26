import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { internalStateCarries, type InternalStateCarriesFacetData } from './algorithm.js';
import { internalStateCarriesScene } from './scene.js';
import { internalStateCarriesIRs } from './irs.js';
import { internalStateCarriesStageView } from './internal-state-carries-stage.js';
import { internalStateCarriesFacet } from './facet.js';

export {
  internalStateCarries,
  narrowInternalStateCarriesData,
  compress,
  padFor,
  IV,
  type InternalStateCarriesFacetData,
  type Cell,
  type CellKind,
} from './algorithm.js';
export {
  internalStateCarriesScene,
  type InternalStateCarriesScene,
  type InternalStateCarriesStep,
  type Carried,
  type Whole,
} from './scene.js';
export { internalStateCarriesIRs } from './irs.js';
export { internalStateCarriesStageView } from './internal-state-carries-stage.js';
export { internalStateCarriesFacet } from './facet.js';

export function registerInternalStateCarries(): void {
  registerAlgorithm<InternalStateCarriesFacetData>('internalStateCarries', internalStateCarries, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('internalStateCarriesScene', internalStateCarriesScene);
  for (const ir of internalStateCarriesIRs) registerIR(ir.id, ir);
  registerView('internal-state-carries-stage', internalStateCarriesStageView);
  registerFacets([internalStateCarriesFacet]);
}
