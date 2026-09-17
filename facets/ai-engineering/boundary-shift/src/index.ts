/**
 * boundary-shift 등록 진입점.
 *
 * 사이드 이펙트로 스스로를 등록하지 않는다 — 부르는 책임은 호스트 앱에 있다
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

import { boundaryShiftAlgorithm } from './algorithm.js';
import { boundaryShiftStageView } from './boundary-shift-stage.js';
import { boundaryShiftDescription } from './description.js';
import { boundaryShiftFacet } from './facet.js';
import { boundaryShiftIRs } from './irs.js';
import { boundaryShiftScene } from './scene.js';

export { boundaryShiftAlgorithm } from './algorithm.js';
export type {
  BoundaryShiftData,
  BoundaryShiftPair,
  BoundaryShiftWord,
} from './algorithm.js';
export { boundaryShiftStageView } from './boundary-shift-stage.js';
export { boundaryShiftDescription } from './description.js';
export { boundaryShiftFacet } from './facet.js';
export { boundaryShiftIRs } from './irs.js';
export { boundaryShiftScene, type BoundaryShiftScene } from './scene.js';

export function registerBoundaryShift(): void {
  // 조각은 mount 하면 스스로 재생을 시작하고 걸음 간격을 스스로 정한다 — 그
  // 둘을 주는 것은 reactive 뿐이다 (S-piece).
  registerAlgorithm('boundaryShift', boundaryShiftAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('boundaryShiftScene', boundaryShiftScene);
  for (const ir of boundaryShiftIRs) registerIR(ir.id, ir);
  registerView('boundary-shift-stage', boundaryShiftStageView);
  registerFacets([boundaryShiftFacet]);
  registerDescription(boundaryShiftFacet.id, boundaryShiftDescription);
}
