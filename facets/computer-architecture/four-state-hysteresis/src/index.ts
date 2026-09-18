import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { fourStateHysteresis, type FourStateHysteresisFacetData } from './algorithm.js';
import { fourStateHysteresisScene } from './scene.js';
import { fourStateHysteresisStageView } from './four-state-hysteresis-stage.js';
import { fourStateHysteresisIRs } from './irs.js';
import { fourStateHysteresisFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './four-state-hysteresis-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerFourStateHysteresis(): void {
  registerAlgorithm<FourStateHysteresisFacetData>('fourStateHysteresis', fourStateHysteresis, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('fourStateHysteresisScene', fourStateHysteresisScene);
  for (const ir of fourStateHysteresisIRs) registerIR(ir.id, ir);
  registerView('four-state-hysteresis-stage', fourStateHysteresisStageView);
  registerFacets([fourStateHysteresisFacet]);
}
