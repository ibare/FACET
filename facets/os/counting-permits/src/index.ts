import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { countingPermits, type CountingPermitsFacetData } from './algorithm.js';
import { countingPermitsScene } from './scene.js';
import { countingPermitsStageView } from './counting-permits-stage.js';
import { countingPermitsIRs } from './irs.js';
import { countingPermitsFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './counting-permits-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerCountingPermits(): void {
  registerAlgorithm<CountingPermitsFacetData>('countingPermits', countingPermits, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('countingPermitsScene', countingPermitsScene);
  for (const ir of countingPermitsIRs) registerIR(ir.id, ir);
  registerView('counting-permits-stage', countingPermitsStageView);
  registerFacets([countingPermitsFacet]);
}
