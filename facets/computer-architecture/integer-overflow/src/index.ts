/**
 * @ffacet/algorithm-integer-overflow — 오버플로 완제품의 등록 진입점.
 *
 * `register<Name>()` 은 호스트 앱이 부른다. 이 모듈이 스스로 부르지 않는다
 * (S-facet MUST NOT — 사이드 이펙트 등록 금지).
 */

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';

import { integerOverflowAlgorithm, type IntegerOverflowData } from './algorithm.js';
import { integerOverflowProjector } from './projector.js';
import { integerOverflowIRs, integerOverflowImperativeIR } from './irs.js';
import { integerOverflowStageView } from './integer-overflow-stage.js';
import { integerOverflowFacet } from './facet.js';
import { integerOverflowDescription } from './description.js';

export {
  integerOverflowAlgorithm,
  integerOverflowProjector,
  integerOverflowIRs,
  integerOverflowImperativeIR,
  integerOverflowStageView,
  integerOverflowFacet,
  integerOverflowDescription,
};
export type { IntegerOverflowData };
export { limitOf, wrapSigned, makeSequence } from './algorithm.js';

export function registerIntegerOverflow(): void {
  // 손잡이(비트 폭 · 수열)가 알고리즘까지 닿아야 하므로 reactive 다.
  // CoroutineMechanism 의 supportedControls 에는 facet 고유 액션이 없어,
  // 러너가 mount 전에 "컨트롤 미지원" 으로 던진다.
  registerAlgorithm<IntegerOverflowData>('integerOverflow', integerOverflowAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('integerOverflowProjector', integerOverflowProjector);
  for (const ir of integerOverflowIRs) registerIR(ir.id, ir);
  registerView('integer-overflow-stage', integerOverflowStageView);
  registerFacets([integerOverflowFacet]);
  registerDescription(integerOverflowFacet.id, integerOverflowDescription);
}
