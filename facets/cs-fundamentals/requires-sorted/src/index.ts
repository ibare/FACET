/**
 * requiresSorted 조각 등록 진입점.
 *
 * 사이드 이펙트로 스스로 등록하지 않는다 — 호출 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { requiresSortedAlgorithm, type RequiresSortedData } from './algorithm.js';
import { requiresSortedProjector } from './projector.js';
import { requiresSortedIRs } from './irs.js';
import { requiresSortedFacet } from './facet.js';
import { requiresSortedDescription } from './description.js';
import { requiresSortedStageView } from './requires-sorted-stage.js';

export {
  requiresSortedAlgorithm,
  requiresSortedProjector,
  requiresSortedIRs,
  requiresSortedFacet,
  requiresSortedDescription,
  requiresSortedStageView,
};
export type { RequiresSortedData, RequiresSortedRow } from './algorithm.js';

export function registerRequiresSorted(): void {
  // 조각은 mount 즉시 스스로 돌고 걸음 간격을 스스로 정한다 → reactive (S-piece).
  registerAlgorithm<RequiresSortedData>('requiresSorted', requiresSortedAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('requiresSorted', requiresSortedProjector);
  for (const ir of requiresSortedIRs) registerIR(ir.id, ir);
  registerView('requires-sorted-stage', requiresSortedStageView);
  registerFacets([requiresSortedFacet]);
  registerDescription(requiresSortedFacet.id, requiresSortedDescription);
}
