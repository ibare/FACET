/**
 * naive-shift-by-one 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 부르는 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { naiveShiftByOneAlgorithm, type NaiveShiftByOneData } from './algorithm.js';
import { naiveShiftByOneProjector } from './projector.js';
import { naiveShiftByOneIRs } from './irs.js';
import { naiveShiftByOneStageView } from './naive-shift-by-one-stage.js';
import { naiveShiftByOneFacet } from './facet.js';
import { naiveShiftByOneDescription } from './description.js';

export function registerNaiveShiftByOne(): void {
  registerAlgorithm<NaiveShiftByOneData>('naiveShiftByOne', naiveShiftByOneAlgorithm, {
    // 조각은 마운트하면 스스로 시작하고 걸음 간격을 스스로 정한다 (S-piece).
    mechanismKind: 'reactive',
  });
  registerProjector('naiveShiftByOneProjector', naiveShiftByOneProjector);
  for (const ir of naiveShiftByOneIRs) registerIR(ir.id, ir);
  registerView('naive-shift-by-one-stage', naiveShiftByOneStageView);
  registerFacets([naiveShiftByOneFacet]);
  registerDescription(naiveShiftByOneFacet.id, naiveShiftByOneDescription);
}

export { naiveShiftByOneAlgorithm } from './algorithm.js';
export type { NaiveShiftByOneData } from './algorithm.js';
export { naiveShiftByOneProjector } from './projector.js';
export { naiveShiftByOneIRs } from './irs.js';
export {
  naiveShiftByOneStageView,
  readNaiveShiftByOneScene,
  type NaiveShiftByOneScene,
} from './naive-shift-by-one-stage.js';
export { naiveShiftByOneFacet } from './facet.js';
export { naiveShiftByOneDescription } from './description.js';
