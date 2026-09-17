/**
 * 등록 진입점. 호스트 앱이 부른다 — 이 파일은 사이드 이펙트로 스스로 부르지
 * 않는다 (S-facet).
 *
 * 화면은 장면(Scene) 방식이다. projector 를 두지 않고 `scene.ts` 가 이벤트를
 * 상태로 옮기며, stage 는 `render(next, prev, { animate })` 하나로 산다 (S-scene).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import {
  associativityReliefAlgorithm,
  setIndexOf,
  setsOf,
  type AssociativityReliefData,
} from './algorithm.js';
import {
  associativityReliefScene,
  cellOf,
  evictionsOf,
  missesOf,
  roundComplete,
  seatsAt,
  setsOfRound,
  waysOf,
  type AssociativityReliefScene,
  type ReliefAccess,
  type ReliefCaption,
  type ReliefOutcome,
  type ReliefRound,
  type ReliefStep,
} from './scene.js';
import { associativityReliefIRs } from './irs.js';
import { associativityReliefStageView } from './associativity-relief-stage.js';
import { associativityReliefFacet } from './facet.js';
import { associativityReliefDescription } from './description.js';

export {
  associativityReliefAlgorithm,
  associativityReliefScene,
  associativityReliefIRs,
  associativityReliefStageView,
  associativityReliefFacet,
  associativityReliefDescription,
  cellOf,
  evictionsOf,
  missesOf,
  roundComplete,
  seatsAt,
  setIndexOf,
  setsOf,
  setsOfRound,
  waysOf,
};
export type {
  AssociativityReliefData,
  AssociativityReliefScene,
  ReliefAccess,
  ReliefCaption,
  ReliefOutcome,
  ReliefRound,
  ReliefStep,
};

export function registerAssociativityRelief(): void {
  registerAlgorithm<AssociativityReliefData>('associativityRelief', associativityReliefAlgorithm, {
    // 조각은 마운트하면 스스로 재생을 시작하고 걸음 간격을 스스로 정한다 (S-piece).
    mechanismKind: 'reactive',
  });
  // 등록 이름은 algorithm 과 겹치지 않게 둔다 (C4).
  registerScenePlan('associativityReliefScene', associativityReliefScene);
  for (const ir of associativityReliefIRs) registerIR(ir.id, ir);
  registerView('associativity-relief-stage', associativityReliefStageView);
  registerFacets([associativityReliefFacet]);
  registerDescription(associativityReliefFacet.id, associativityReliefDescription);
}
