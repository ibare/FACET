/**
 * 온도와 표본 추출 — 등록.
 *
 * `registerTemperatureSampling()` 은 호스트가 부른다. 이 파일은 스스로 부르지 않는다.
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { temperatureSamplingAlgorithm, type TemperatureSamplingData } from './algorithm.js';
import { temperatureSamplingProjector } from './projector.js';
import { temperatureSamplingIRs } from './irs.js';
import { temperatureSamplingStageView } from './temperature-sampling-stage.js';
import { temperatureSamplingFacet } from './facet.js';

export {
  temperatureSamplingAlgorithm,
  computeRound,
  usedFlags,
  lcgStates,
  nextState,
  penalize,
  scale,
  softmax,
  pickIndex,
  topIndex,
  LCG_MUL,
  LCG_ADD,
  LCG_MOD,
} from './algorithm.js';
export type { TemperatureSamplingData, RoundResult } from './algorithm.js';
export { temperatureSamplingProjector } from './projector.js';
export { temperatureSamplingImperativeIR, temperatureSamplingIRs } from './irs.js';
export { temperatureSamplingStageView } from './temperature-sampling-stage.js';
export type { TemperatureSamplingStage } from './temperature-sampling-stage.js';
export { temperatureSamplingFacet } from './facet.js';

export function registerTemperatureSampling(): void {
  registerAlgorithm<TemperatureSamplingData>('temperatureSampling', temperatureSamplingAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('temperatureSamplingProjector', temperatureSamplingProjector);
  for (const ir of temperatureSamplingIRs) registerIR(ir.id, ir);
  registerView('temperature-sampling-stage', temperatureSamplingStageView);
  registerFacets([temperatureSamplingFacet]);
}
