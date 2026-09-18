import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { fiveStagePipelineAlgorithm } from './algorithm.js';
import { fiveStagePipelineProjector } from './projector.js';
import { fiveStagePipelineIRs } from './irs.js';
import { fiveStagePipelineStageView } from './five-stage-pipeline-stage.js';
import { fiveStagePipelineFacet } from './facet.js';

export {
  fiveStagePipelineAlgorithm,
  computeFiveStagePipelineRound,
  countPipelinedCycles,
  countSerialCycles,
  speedupPercent,
  slotsAt,
  fetchCycleOf,
  writebackCycleOf,
} from './algorithm.js';
export type { FiveStagePipelineData } from './algorithm.js';
export { fiveStagePipelineProjector } from './projector.js';
export { fiveStagePipelineImperativeIR, fiveStagePipelineIRs } from './irs.js';
export { fiveStagePipelineStageView } from './five-stage-pipeline-stage.js';
export type { FiveStagePipelineStage } from './five-stage-pipeline-stage.js';
export { fiveStagePipelineFacet } from './facet.js';

/** 5단계 파이프라인 facet 을 등록한다. 호스트가 부른다 — 여기서 스스로 부르지 않는다. */
export function registerFiveStagePipeline(): void {
  registerAlgorithm('fiveStagePipeline', fiveStagePipelineAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('fiveStagePipelineProjector', fiveStagePipelineProjector);
  for (const ir of fiveStagePipelineIRs) registerIR(ir.id, ir);
  registerView('five-stage-pipeline-stage', fiveStagePipelineStageView);
  registerFacets([fiveStagePipelineFacet]);
}
