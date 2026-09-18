import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { controlHazardAlgorithm } from './algorithm.js';
import { controlHazardProjector } from './projector.js';
import { controlHazardIRs } from './irs.js';
import { controlHazardStageView } from './control-hazard-stage.js';
import { controlHazardFacet } from './facet.js';

export {
  controlHazardAlgorithm,
  simulateControlHazard,
  STAGE_COUNT,
} from './algorithm.js';
export type { ControlHazardData, HazardFrame, HazardRun, SlotToken } from './algorithm.js';
export { controlHazardProjector } from './projector.js';
export { controlHazardImperativeIR, controlHazardIRs } from './irs.js';
export { controlHazardStageView } from './control-hazard-stage.js';
export type { ControlHazardStage, ControlHazardSlot } from './control-hazard-stage.js';
export { controlHazardFacet } from './facet.js';

/**
 * 제어 해저드 facet 등록. 손잡이(`segmented-slider`)가 있으므로 reactive 다 —
 * coroutine 으로 두면 러너가 마운트 시점에 throw 하고 손잡이가 알고리즘에 닿지 않는다.
 */
export function registerControlHazard(): void {
  registerAlgorithm('controlHazard', controlHazardAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('controlHazardProjector', controlHazardProjector);
  for (const ir of controlHazardIRs) registerIR(ir.id, ir);
  registerView('control-hazard-stage', controlHazardStageView);
  registerFacets([controlHazardFacet]);
}
