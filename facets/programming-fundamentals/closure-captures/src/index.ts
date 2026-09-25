import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { closureCaptures, type ClosureCapturesFacetData } from './algorithm.js';
import { closureCapturesScene } from './scene.js';
import { closureCapturesStageView } from './closure-captures-stage.js';
import { closureCapturesIRs } from './irs.js';
import { closureCapturesFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './closure-captures-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerClosureCaptures(): void {
  registerAlgorithm<ClosureCapturesFacetData>('closureCaptures', closureCaptures, { mechanismKind: 'reactive' });
  registerScenePlan('closureCapturesScene', closureCapturesScene);
  for (const ir of closureCapturesIRs) registerIR(ir.id, ir);
  registerView('closure-captures-stage', closureCapturesStageView);
  registerFacets([closureCapturesFacet]);
}
