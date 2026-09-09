/**
 * pickNearestUnsettled 등록 진입점.
 *
 * 부르는 책임은 호스트 앱에 있다 — 이 파일은 사이드 이펙트로 스스로 부르지 않는다
 * (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { pickNearestUnsettledAlgorithm } from './algorithm.js';
import { pickNearestUnsettledProjector } from './projector.js';
import { pickNearestUnsettledIRs } from './irs.js';
import { pickNearestUnsettledStageView } from './pick-nearest-unsettled-stage.js';
import { pickNearestUnsettledFacet } from './facet.js';
import { pickNearestUnsettledDescription } from './description.js';

export function registerPickNearestUnsettled(): void {
  registerAlgorithm('pickNearestUnsettled', pickNearestUnsettledAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('pickNearestUnsettledProjector', pickNearestUnsettledProjector);
  for (const ir of pickNearestUnsettledIRs) registerIR(ir.id, ir);
  registerView('pick-nearest-unsettled-stage', pickNearestUnsettledStageView);
  registerFacets([pickNearestUnsettledFacet]);
  registerDescription(pickNearestUnsettledFacet.id, pickNearestUnsettledDescription);
}

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './pick-nearest-unsettled-stage.js';
export * from './facet.js';
export * from './description.js';
