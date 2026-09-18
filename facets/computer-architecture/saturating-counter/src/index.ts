import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { saturatingCounterAlgorithm } from './algorithm.js';
import { saturatingCounterProjector } from './projector.js';
import { saturatingCounterIRs } from './irs.js';
import { saturatingCounterStageView } from './saturating-counter-stage.js';
import { saturatingCounterFacet } from './facet.js';

export {
  saturatingCounterAlgorithm,
  computeSaturatingCounterRound,
} from './algorithm.js';
export type { SaturatingCounterData, SaturatingCounterRound } from './algorithm.js';
export { saturatingCounterProjector } from './projector.js';
export { saturatingCounterImperativeIR, saturatingCounterIRs } from './irs.js';
export { saturatingCounterStageView } from './saturating-counter-stage.js';
export type { SaturatingCounterStage } from './saturating-counter-stage.js';
export { saturatingCounterFacet } from './facet.js';

export function registerSaturatingCounter(): void {
  // 손잡이(segmented-slider)가 붙으므로 reactive 로 등록한다.
  registerAlgorithm('saturatingCounter', saturatingCounterAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('saturatingCounterProjector', saturatingCounterProjector);
  for (const ir of saturatingCounterIRs) registerIR(ir.id, ir);
  registerView('saturating-counter-stage', saturatingCounterStageView);
  registerFacets([saturatingCounterFacet]);
}
