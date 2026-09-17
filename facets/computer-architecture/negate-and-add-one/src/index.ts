/**
 * negate-and-add-one 등록 진입점.
 *
 * 화면은 장면(Scene) 방식이다 — projector 대신 `scene.ts` 의 `ScenePlan` 을 등록하고,
 * stage 가 `render` 하나로 산다 (S-scene).
 *
 * 부르는 책임은 호스트 앱에 있다 — 이 파일은 사이드 이펙트로 스스로 등록하지
 * 않는다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { negateAndAddOneAlgorithm, type NegateAndAddOneData } from './algorithm.js';
import { negateAndAddOneScene, type NegateAndAddOneScene } from './scene.js';
import { negateAndAddOneIRs } from './irs.js';
import { negateAndAddOneStageView } from './negate-and-add-one-stage.js';
import { negateAndAddOneFacet } from './facet.js';

export function registerNegateAndAddOne(): void {
  registerAlgorithm('negateAndAddOne', negateAndAddOneAlgorithm, { mechanismKind: 'reactive' });
  registerScenePlan('negateAndAddOneScene', negateAndAddOneScene);
  for (const ir of negateAndAddOneIRs) registerIR(ir.id, ir);
  registerView('negate-and-add-one-stage', negateAndAddOneStageView);
  registerFacets([negateAndAddOneFacet]);
}

export {
  negateAndAddOneAlgorithm,
  negateAndAddOneScene,
  negateAndAddOneIRs,
  negateAndAddOneStageView,
  negateAndAddOneFacet,
};
export type { NegateAndAddOneData, NegateAndAddOneScene };
