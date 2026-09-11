/**
 * row-times-column 등록 진입점.
 *
 * 사이드 이펙트로 스스로 등록하지 않는다 — 부르는 것은 호스트의 몫이다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { rowTimesColumnAlgorithm, type RowTimesColumnData } from './algorithm.js';
import { rowTimesColumnProjector } from './projector.js';
import { rowTimesColumnStageView } from './row-times-column-stage.js';
import { rowTimesColumnIRs } from './irs.js';
import { rowTimesColumnFacet } from './facet.js';
import { rowTimesColumnDescription } from './description.js';

export {
  rowTimesColumnAlgorithm,
  rowTimesColumnProjector,
  rowTimesColumnStageView,
  rowTimesColumnIRs,
  rowTimesColumnFacet,
  rowTimesColumnDescription,
};
export type { RowTimesColumnData };

export function registerRowTimesColumn(): void {
  registerAlgorithm('rowTimesColumn', rowTimesColumnAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('rowTimesColumnProjector', rowTimesColumnProjector);
  for (const ir of rowTimesColumnIRs) registerIR(ir.id, ir);
  registerView('row-times-column-stage', rowTimesColumnStageView);
  registerFacets([rowTimesColumnFacet]);
  registerDescription(rowTimesColumnFacet.id, rowTimesColumnDescription);
}
