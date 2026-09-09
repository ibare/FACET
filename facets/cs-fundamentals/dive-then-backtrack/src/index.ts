/**
 * 되짚어 나오기 조각의 등록 진입점.
 *
 * `registerDiveThenBacktrack()` 는 사이드 이펙트로 불리지 않는다 — 호출 책임은
 * 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { diveThenBacktrackAlgorithm, type DiveThenBacktrackData } from './algorithm.js';
import { diveThenBacktrackProjector } from './projector.js';
import { diveThenBacktrackIRs } from './irs.js';
import { diveThenBacktrackFacet } from './facet.js';
import { diveThenBacktrackDescription } from './description.js';
import { diveThenBacktrackStageView } from './dive-then-backtrack-stage.js';

export function registerDiveThenBacktrack(): void {
  registerAlgorithm<DiveThenBacktrackData>('diveThenBacktrack', diveThenBacktrackAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('diveThenBacktrackProjector', diveThenBacktrackProjector);
  for (const ir of diveThenBacktrackIRs) registerIR(ir.id, ir);
  registerView('dive-then-backtrack-stage', diveThenBacktrackStageView);
  registerFacets([diveThenBacktrackFacet]);
  registerDescription(diveThenBacktrackFacet.id, diveThenBacktrackDescription);
}

export {
  diveThenBacktrackAlgorithm,
  diveThenBacktrackProjector,
  diveThenBacktrackIRs,
  diveThenBacktrackFacet,
  diveThenBacktrackDescription,
  diveThenBacktrackStageView,
};
export type { DiveThenBacktrackData };
