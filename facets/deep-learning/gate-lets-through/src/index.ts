import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { gateLetsThrough, type GateLetsThroughFacetData } from './algorithm.js';
import { gateLetsThroughScene } from './scene.js';
import { gateLetsThroughStageView } from './gate-lets-through-stage.js';
import { gateLetsThroughIRs } from './irs.js';
import { gateLetsThroughFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './gate-lets-through-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerGateLetsThrough(): void {
  registerAlgorithm<GateLetsThroughFacetData>('gateLetsThrough', gateLetsThrough, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('gateLetsThroughScene', gateLetsThroughScene);
  for (const ir of gateLetsThroughIRs) registerIR(ir.id, ir);
  registerView('gate-lets-through-stage', gateLetsThroughStageView);
  registerFacets([gateLetsThroughFacet]);
}
