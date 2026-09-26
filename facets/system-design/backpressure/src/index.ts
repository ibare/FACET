import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { backpressureAlgorithm, type BackpressureData } from './algorithm.js';
import { backpressureProjector } from './projector.js';
import { backpressureIRs } from './irs.js';
import { backpressureStageView } from './backpressure-stage.js';
import { backpressureFacet } from './facet.js';

export {
  backpressureAlgorithm,
  simulateBackpressure,
  ladderPeaks,
  readBackpressureData,
  roundPct,
  type BackpressureData,
  type BackpressureRun,
  type WorkStep,
  type ArriveStep,
} from './algorithm.js';
export { backpressureProjector } from './projector.js';
export { backpressureImperativeIR, backpressureIRs } from './irs.js';
export { backpressureStageView, type BackpressureStage } from './backpressure-stage.js';
export { backpressureFacet, type BackpressureInitialData } from './facet.js';

/** 배압 facet 을 등록한다 — 손잡이가 있어 reactive 로 등록한다. */
export function registerBackpressure(): void {
  registerAlgorithm<BackpressureData>('backpressure', backpressureAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('backpressureProjector', backpressureProjector);
  for (const ir of backpressureIRs) registerIR(ir.id, ir);
  registerView('backpressure-stage', backpressureStageView);
  registerFacets([backpressureFacet]);
}
