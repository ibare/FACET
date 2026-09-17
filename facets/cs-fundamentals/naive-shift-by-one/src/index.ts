/**
 * naive-shift-by-one 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 부르는 책임은 호스트 앱에 있다 (S-facet).
 *
 * 화면은 장면(Scene) 방식이다. projector 가 없고, 걸음마다 쌓은 장면에서 화면을
 * 셈으로 얻으므로 띠를 끌어 되짚어도 같은 화면이 선다 (S-scene).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { naiveShiftByOneAlgorithm, type NaiveShiftByOneData } from './algorithm.js';
import { naiveShiftByOneScene } from './scene.js';
import { naiveShiftByOneIRs } from './irs.js';
import { naiveShiftByOneStageView } from './naive-shift-by-one-stage.js';
import { naiveShiftByOneFacet } from './facet.js';

export function registerNaiveShiftByOne(): void {
  registerAlgorithm<NaiveShiftByOneData>('naiveShiftByOne', naiveShiftByOneAlgorithm, {
    // 조각은 마운트하면 스스로 시작하고 걸음 간격을 스스로 정한다 (S-piece).
    mechanismKind: 'reactive',
  });
  registerScenePlan('naiveShiftByOneScene', naiveShiftByOneScene);
  for (const ir of naiveShiftByOneIRs) registerIR(ir.id, ir);
  registerView('naive-shift-by-one-stage', naiveShiftByOneStageView);
  registerFacets([naiveShiftByOneFacet]);
}

export { naiveShiftByOneAlgorithm } from './algorithm.js';
export type { NaiveShiftByOneData } from './algorithm.js';
export {
  naiveShiftByOneScene,
  comparisonsOf,
  matchedOf,
  type NaiveShiftByOneScene,
  type NaiveShiftCaption,
  type NaiveShiftStep,
  type ShiftAttempt,
} from './scene.js';
export { naiveShiftByOneIRs } from './irs.js';
export { naiveShiftByOneStageView } from './naive-shift-by-one-stage.js';
export { naiveShiftByOneFacet } from './facet.js';
