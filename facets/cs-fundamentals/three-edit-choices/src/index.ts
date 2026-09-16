/**
 * 등록 진입점. 호출 책임은 호스트 앱에 있다 — 이 파일은 스스로 부르지 않는다.
 *
 * 화면은 장면(Scene) 방식이다 — 이벤트가 `ThreeEditChoicesScene` 으로 쌓이고 stage 의
 * `render` 하나가 그 장면을 통째로 세운다. 그래서 스크럽 띠로 아무 걸음에나 갈 수
 * 있다 (S-scene).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { threeEditChoicesAlgorithm, computeEditTable, type ThreeEditChoicesData } from './algorithm.js';
import { threeEditChoicesScene } from './scene.js';
import { threeEditChoicesIRs } from './irs.js';
import { threeEditChoicesStageView } from './three-edit-choices-stage.js';
import { threeEditChoicesFacet } from './facet.js';
import { threeEditChoicesDescription } from './description.js';

export function registerThreeEditChoices(): void {
  registerAlgorithm<ThreeEditChoicesData>('threeEditChoices', threeEditChoicesAlgorithm, {
    // 조각은 마운트하면 스스로 시작하고 걸음 간격을 스스로 정한다. 둘 다 reactive 만 준다.
    mechanismKind: 'reactive',
  });
  registerScenePlan('threeEditChoicesScene', threeEditChoicesScene);
  for (const ir of threeEditChoicesIRs) registerIR(ir.id, ir);
  registerView('three-edit-choices-stage', threeEditChoicesStageView);
  registerFacets([threeEditChoicesFacet]);
  registerDescription(threeEditChoicesFacet.id, threeEditChoicesDescription);
}

export {
  threeEditChoicesAlgorithm,
  computeEditTable,
  threeEditChoicesScene,
  threeEditChoicesIRs,
  threeEditChoicesStageView,
  threeEditChoicesFacet,
  threeEditChoicesDescription,
};
export type { ThreeEditChoicesData };
export type {
  EditBranch,
  EditCell,
  EditStep,
  EditVisit,
  ThreeEditChoicesScene,
} from './scene.js';
