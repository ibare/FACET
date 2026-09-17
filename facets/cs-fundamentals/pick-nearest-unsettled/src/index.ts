/**
 * pickNearestUnsettled 등록 진입점.
 *
 * 부르는 책임은 호스트 앱에 있다 — 이 파일은 사이드 이펙트로 스스로 부르지 않는다
 * (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { pickNearestUnsettledAlgorithm } from './algorithm.js';
import { pickNearestUnsettledScene } from './scene.js';
import { pickNearestUnsettledIRs } from './irs.js';
import { pickNearestUnsettledStageView } from './pick-nearest-unsettled-stage.js';
import { pickNearestUnsettledFacet } from './facet.js';

export function registerPickNearestUnsettled(): void {
  registerAlgorithm('pickNearestUnsettled', pickNearestUnsettledAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('pickNearestUnsettledScene', pickNearestUnsettledScene);
  for (const ir of pickNearestUnsettledIRs) registerIR(ir.id, ir);
  registerView('pick-nearest-unsettled-stage', pickNearestUnsettledStageView);
  registerFacets([pickNearestUnsettledFacet]);
}

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './pick-nearest-unsettled-stage.js';
export * from './facet.js';
