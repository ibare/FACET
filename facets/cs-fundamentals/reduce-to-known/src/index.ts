/**
 * 환원 조각의 등록 진입점.
 *
 * 호출 책임은 호스트 앱에 있다 — 이 파일이 사이드 이펙트로 스스로 부르지 않는다
 * (S-facet).
 */

export { reduceToKnownAlgorithm, assignPeriods, type ReduceToKnownData } from './algorithm.js';
export {
  reduceToKnownScene,
  edgeIndicesAt,
  edgesOpenedAt,
  periodsOf,
  slotCount,
  type ReduceToKnownScene,
  type ReduceToKnownBoard,
  type ReduceToKnownOverlap,
} from './scene.js';
export { reduceToKnownIRs } from './irs.js';
export { reduceToKnownFacet } from './facet.js';
export { reduceToKnownDescription } from './description.js';
export { reduceToKnownStageView } from './reduce-to-known-stage.js';

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { reduceToKnownAlgorithm, type ReduceToKnownData } from './algorithm.js';
import { reduceToKnownScene } from './scene.js';
import { reduceToKnownIRs } from './irs.js';
import { reduceToKnownFacet } from './facet.js';
import { reduceToKnownDescription } from './description.js';
import { reduceToKnownStageView } from './reduce-to-known-stage.js';

export function registerReduceToKnown(): void {
  registerAlgorithm<ReduceToKnownData>('reduceToKnown', reduceToKnownAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('reduceToKnownScene', reduceToKnownScene);
  for (const ir of reduceToKnownIRs) registerIR(ir.id, ir);
  registerView('reduce-to-known-stage', reduceToKnownStageView);
  registerFacets([reduceToKnownFacet]);
  registerDescription(reduceToKnownFacet.id, reduceToKnownDescription);
}
