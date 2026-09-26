import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { fewerGates, type FewerGatesFacetData } from './algorithm.js';
import { fewerGatesScene } from './scene.js';
import { fewerGatesStageView } from './fewer-gates-stage.js';
import { fewerGatesIRs } from './irs.js';
import { fewerGatesFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './fewer-gates-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerFewerGates(): void {
  registerAlgorithm<FewerGatesFacetData>('fewerGates', fewerGates, { mechanismKind: 'reactive' });
  registerScenePlan('fewerGatesScene', fewerGatesScene);
  for (const ir of fewerGatesIRs) registerIR(ir.id, ir);
  registerView('fewer-gates-stage', fewerGatesStageView);
  registerFacets([fewerGatesFacet]);
}
