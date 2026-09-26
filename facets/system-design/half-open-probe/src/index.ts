import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { halfOpenProbe } from './algorithm.js';
import type { HalfOpenProbeFacetData } from './algorithm.js';
import { halfOpenProbeFacet } from './facet.js';
import { halfOpenProbeStageView } from './half-open-probe-stage.js';
import { halfOpenProbeIRs } from './irs.js';
import { halfOpenProbeScene } from './scene.js';

export { halfOpenProbe, narrowHalfOpenProbe, planHalfOpenProbe } from './algorithm.js';
export type { HalfOpenProbeFacetData } from './algorithm.js';
export { halfOpenProbeScene } from './scene.js';
export type { HalfOpenScene } from './scene.js';
export { halfOpenProbeStageView } from './half-open-probe-stage.js';
export { halfOpenProbeIRs } from './irs.js';
export { halfOpenProbeFacet } from './facet.js';

export function registerHalfOpenProbe(): void {
  registerAlgorithm<HalfOpenProbeFacetData>('halfOpenProbe', halfOpenProbe, { mechanismKind: 'reactive' });
  registerScenePlan('halfOpenProbeScene', halfOpenProbeScene);
  for (const ir of halfOpenProbeIRs) registerIR(ir.id, ir);
  registerView('half-open-probe-stage', halfOpenProbeStageView);
  registerFacets([halfOpenProbeFacet]);
}
