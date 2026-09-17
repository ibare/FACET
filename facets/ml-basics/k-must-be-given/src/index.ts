/**
 * k-must-be-given 등록 진입점.
 *
 * 화면은 명령이 아니라 **장면**에서 만들어지므로 어느 걸음으로든 곧장 갈 수 있다
 * (S-scene). 사이드 이펙트로 스스로 부르지 않는다 — 호출 책임은 호스트 앱에 있다
 * (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { kMustBeGivenAlgorithm } from './algorithm.js';
import { kMustBeGivenFacet } from './facet.js';
import { kMustBeGivenIRs } from './irs.js';
import { kMustBeGivenScene } from './scene.js';
import { kMustBeGivenStageView } from './k-must-be-given-stage.js';

export { kMustBeGivenAlgorithm, runKMeans } from './algorithm.js';
export type { KMustBeGivenData, KMeansRun } from './algorithm.js';
export {
  kMustBeGivenScene,
  type KMustBeGivenScene,
  type KStep,
  type KCaption,
  type ScenePoint,
  type ChosenRun,
  type SettledRun,
} from './scene.js';
export { kMustBeGivenIRs } from './irs.js';
export { kMustBeGivenFacet } from './facet.js';
export { kMustBeGivenStageView } from './k-must-be-given-stage.js';

export function registerKMustBeGiven(): void {
  registerAlgorithm('kMustBeGiven', kMustBeGivenAlgorithm, { mechanismKind: 'reactive' });
  registerScenePlan('kMustBeGivenScene', kMustBeGivenScene);
  for (const ir of kMustBeGivenIRs) registerIR(ir.id, ir);
  registerView('k-must-be-given-stage', kMustBeGivenStageView);
  registerFacets([kMustBeGivenFacet]);
}
