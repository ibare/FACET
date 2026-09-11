/**
 * 등록 진입점. 호출 책임은 호스트 앱에 있다 — 이 파일은 스스로 부르지 않는다.
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { threeEditChoicesAlgorithm, computeEditTable, type ThreeEditChoicesData } from './algorithm.js';
import { threeEditChoicesProjector } from './projector.js';
import { threeEditChoicesIRs } from './irs.js';
import { threeEditChoicesStageView } from './three-edit-choices-stage.js';
import { threeEditChoicesFacet } from './facet.js';
import { threeEditChoicesDescription } from './description.js';

export function registerThreeEditChoices(): void {
  registerAlgorithm<ThreeEditChoicesData>('threeEditChoices', threeEditChoicesAlgorithm, {
    // 조각은 마운트하면 스스로 시작하고 걸음 간격을 스스로 정한다. 둘 다 reactive 만 준다.
    mechanismKind: 'reactive',
  });
  registerProjector('threeEditChoicesProjector', threeEditChoicesProjector);
  for (const ir of threeEditChoicesIRs) registerIR(ir.id, ir);
  registerView('three-edit-choices-stage', threeEditChoicesStageView);
  registerFacets([threeEditChoicesFacet]);
  registerDescription(threeEditChoicesFacet.id, threeEditChoicesDescription);
}

export {
  threeEditChoicesAlgorithm,
  computeEditTable,
  threeEditChoicesProjector,
  threeEditChoicesIRs,
  threeEditChoicesStageView,
  threeEditChoicesFacet,
  threeEditChoicesDescription,
};
export type { ThreeEditChoicesData };
