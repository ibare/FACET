/**
 * prefix-suffix-jump 등록 진입점.
 *
 * 부수효과로 스스로 부르지 않는다 — 호출 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { prefixSuffixJumpAlgorithm, type PrefixSuffixJumpData } from './algorithm.js';
import { prefixSuffixJumpProjector } from './projector.js';
import { prefixSuffixJumpIRs } from './irs.js';
import { prefixSuffixJumpStageView } from './prefix-suffix-jump-stage.js';
import { prefixSuffixJumpFacet } from './facet.js';
import { prefixSuffixJumpDescription } from './description.js';

export {
  prefixSuffixJumpAlgorithm,
  prefixSuffixJumpProjector,
  prefixSuffixJumpIRs,
  prefixSuffixJumpStageView,
  prefixSuffixJumpFacet,
  prefixSuffixJumpDescription,
};
export type { PrefixSuffixJumpData };

export function registerPrefixSuffixJump(): void {
  // 조각은 스스로 시작하고 걸음 간격도 스스로 정한다 (S-piece).
  registerAlgorithm<PrefixSuffixJumpData>('prefixSuffixJump', prefixSuffixJumpAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('prefixSuffixJumpProjector', prefixSuffixJumpProjector);
  for (const ir of prefixSuffixJumpIRs) registerIR(ir.id, ir);
  registerView('prefix-suffix-jump-stage', prefixSuffixJumpStageView);
  registerFacets([prefixSuffixJumpFacet]);
  registerDescription(prefixSuffixJumpFacet.id, prefixSuffixJumpDescription);
}
