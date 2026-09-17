/**
 * latency-ladder 조각의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 등록하지 않는다 — 부르는 책임은 호스트 앱에 있다
 * (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { latencyLadderAlgorithm, type LatencyLadderData } from './algorithm.js';
import { latencyLadderDescription } from './description.js';
import { latencyLadderFacet } from './facet.js';
import { latencyLadderIRs } from './irs.js';
import { latencyLadderStageView } from './latency-ladder-stage.js';
import { latencyLadderScene } from './scene.js';

export {
  latencyLadderAlgorithm,
  latencyLevelsOf,
  latencyRungs,
  latencySpanFactor,
  type LatencyLadderData,
  type LatencyLevel,
  type LatencyRung,
} from './algorithm.js';
export { latencyLadderDescription } from './description.js';
export { latencyLadderFacet } from './facet.js';
export { latencyLadderIRs } from './irs.js';
export { latencyLadderStageView } from './latency-ladder-stage.js';
export {
  latencyLadderScene,
  type LatencyCaption,
  type LatencyLadderScene,
  type LatencyRungState,
  type LatencyStep,
} from './scene.js';

export function registerLatencyLadder(): void {
  registerAlgorithm<LatencyLadderData>('latencyLadder', latencyLadderAlgorithm, {
    mechanismKind: 'reactive',
  });
  // 장면 이름은 algorithm 과 겹치지 않는다 — `module:` 참조가 어느 쪽인지
  // 말하지 못하게 된다 (C4, packages/core/test/register-names.test.ts).
  registerScenePlan('latencyLadderScene', latencyLadderScene);
  for (const ir of latencyLadderIRs) registerIR(ir.id, ir);
  registerView('latency-ladder-stage', latencyLadderStageView);
  registerFacets([latencyLadderFacet]);
  registerDescription(latencyLadderFacet.id, latencyLadderDescription);
}
