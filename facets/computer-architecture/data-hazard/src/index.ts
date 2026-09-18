import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { dataHazardAlgorithm } from './algorithm.js';
import { dataHazardProjector } from './projector.js';
import { dataHazardIRs } from './irs.js';
import { dataHazardStageView } from './data-hazard-stage.js';
import { dataHazardFacet } from './facet.js';

export { dataHazardAlgorithm, reorderFacts, scheduleDataHazard } from './algorithm.js';
export type {
  DataHazardData,
  DataHazardInstruction,
  DataHazardPlan,
  DataHazardRule,
  DataHazardSchedule,
  OperandKind,
  OperandRead,
  ScheduledInstruction,
} from './algorithm.js';
export { dataHazardProjector } from './projector.js';
export { dataHazardImperativeIR, dataHazardIRs } from './irs.js';
export { dataHazardStageView } from './data-hazard-stage.js';
export { dataHazardFacet } from './facet.js';

export function registerDataHazard(): void {
  // 손잡이(segmented-slider)를 받으므로 reactive 다 — facet.ts 가 아니라 여기 적는다.
  registerAlgorithm('dataHazard', dataHazardAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('dataHazardProjector', dataHazardProjector);
  for (const ir of dataHazardIRs) registerIR(ir.id, ir);
  registerView('data-hazard-stage', dataHazardStageView);
  registerFacets([dataHazardFacet]);
}
