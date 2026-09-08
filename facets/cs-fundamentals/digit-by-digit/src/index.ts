/**
 * @ffacet/algorithm-digit-by-digit — 자릿수 정렬 조각 (piece).
 *
 * 등록은 호스트 앱의 책임이다. 이 모듈은 사이드 이펙트로 register 를 부르지 않는다.
 */

export {
  digitByDigit,
  computeDigitByDigitRounds,
  type DigitByDigitData,
  type DigitPlacement,
  type DigitRound,
} from './algorithm.js';
export { digitByDigitProjector } from './projector.js';
export { digitByDigitIRs } from './irs.js';
export { digitByDigitFacet } from './facet.js';
export { digitByDigitDescription } from './description.js';
export { digitByDigitStageView } from './digit-by-digit-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { digitByDigit, type DigitByDigitData } from './algorithm.js';
import { digitByDigitProjector } from './projector.js';
import { digitByDigitIRs } from './irs.js';
import { digitByDigitStageView } from './digit-by-digit-stage.js';
import { digitByDigitFacet } from './facet.js';
import { digitByDigitDescription } from './description.js';

/** algorithm/projector/IR/view/facet/description 등록 헬퍼. */
export function registerDigitByDigit(): void {
  registerAlgorithm<DigitByDigitData>('digitByDigit', digitByDigit, {
    mechanismKind: 'reactive',
  });
  registerProjector('digitByDigitProjector', digitByDigitProjector);
  for (const ir of digitByDigitIRs) registerIR(ir.id, ir);
  registerView('digit-by-digit-stage', digitByDigitStageView);
  registerFacets([digitByDigitFacet]);
  registerDescription(digitByDigitFacet.id, digitByDigitDescription);
}
