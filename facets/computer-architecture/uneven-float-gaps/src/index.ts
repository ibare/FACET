/**
 * 고르지 않은 눈금 — 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다. 부르는 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { unevenFloatGapsAlgorithm, type UnevenFloatGapsData } from './algorithm.js';
import { unevenFloatGapsProjector } from './projector.js';
import { unevenFloatGapsIRs } from './irs.js';
import { unevenFloatGapsFacet } from './facet.js';
import { unevenFloatGapsDescription } from './description.js';
import { unevenFloatGapsStageView } from './uneven-float-gaps-stage.js';

export { unevenFloatGapsAlgorithm, type UnevenFloatGapsData } from './algorithm.js';
export { unevenFloatGapsProjector } from './projector.js';
export { unevenFloatGapsIRs } from './irs.js';
export { unevenFloatGapsFacet } from './facet.js';
export { unevenFloatGapsDescription } from './description.js';
export { unevenFloatGapsStageView } from './uneven-float-gaps-stage.js';

export function registerUnevenFloatGaps(): void {
  registerAlgorithm<UnevenFloatGapsData>('unevenFloatGaps', unevenFloatGapsAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('unevenFloatGapsProjector', unevenFloatGapsProjector);
  for (const ir of unevenFloatGapsIRs) registerIR(ir.id, ir);
  registerView('uneven-float-gaps-stage', unevenFloatGapsStageView);
  registerFacets([unevenFloatGapsFacet]);
  registerDescription(unevenFloatGapsFacet.id, unevenFloatGapsDescription);
}
