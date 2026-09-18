import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { speculativeDecodingAlgorithm, type SpeculativeDecodingData } from './algorithm.js';
import { speculativeDecodingProjector } from './projector.js';
import { speculativeDecodingIRs } from './irs.js';
import { speculativeDecodingStageView } from './speculative-decoding-stage.js';
import { speculativeDecodingFacet } from './facet.js';

export {
  speculativeDecodingAlgorithm,
  speculateRounds,
  matchArray,
  splitTokens,
  type SpeculativeDecodingData,
  type SpeculationRound,
  type SpeculationRun,
} from './algorithm.js';
export { speculativeDecodingProjector } from './projector.js';
export { speculativeDecodingImperativeIR, speculativeDecodingIRs } from './irs.js';
export {
  speculativeDecodingStageView,
  type SpeculativeDecodingStage,
  type SpeculativeDecodingStageData,
  type SpeculativeDecodingSummary,
} from './speculative-decoding-stage.js';
export { speculativeDecodingFacet } from './facet.js';

/** 사색적 디코딩 facet 을 전역 레지스트리에 올린다. 호출은 호스트 몫이다. */
export function registerSpeculativeDecoding(): void {
  registerAlgorithm<SpeculativeDecodingData>('speculativeDecoding', speculativeDecodingAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('speculativeDecodingProjector', speculativeDecodingProjector);
  for (const ir of speculativeDecodingIRs) registerIR(ir.id, ir);
  registerView('speculative-decoding-stage', speculativeDecodingStageView);
  registerFacets([speculativeDecodingFacet]);
}
