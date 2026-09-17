/**
 * @ffacet/algorithm-edit-distance — 등록 진입점.
 *
 * 등록 책임은 호스트 앱에 있다. 이 파일은 사이드 이펙트로 스스로를 등록하지 않는다.
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { editDistanceAlgorithm, type EditDistanceData } from './algorithm.js';
import { editDistanceProjector } from './projector.js';
import { editDistanceIRs, editDistanceImperativeIR } from './irs.js';
import { editDistanceStageView } from './edit-distance-stage.js';
import { editDistanceFacet } from './facet.js';

export {
  editDistanceAlgorithm,
  editDistanceProjector,
  editDistanceIRs,
  editDistanceImperativeIR,
  editDistanceStageView,
  editDistanceFacet,
};
export { backtrackEdits, fillEditTable } from './algorithm.js';
export type { EditDistanceData, EditOp, EditStep } from './algorithm.js';

export function registerEditDistance(): void {
  registerAlgorithm<EditDistanceData>('editDistance', editDistanceAlgorithm, {
    // 손잡이가 있는 완제품은 reactive 다 — 조작이 곧 다음 판의 시작이다.
    mechanismKind: 'reactive',
  });
  registerProjector('editDistanceProjector', editDistanceProjector);
  for (const ir of editDistanceIRs) registerIR(ir.id, ir);
  registerView('edit-distance-stage', editDistanceStageView);
  registerFacets([editDistanceFacet]);
}
