/**
 * @ffacet/algorithm-hash-fixed-length — 고정 길이 출력 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 세 걸음을 자동 재생하고 정지하며, 다시 보기 버튼
 * 하나 외에는 조작을 받지 않는다. ReactiveMechanism 이라 컨트롤바 없이 스스로
 * 재생하고 걸음 간격도 스스로 정한다 (ctx.sleep).
 *
 * algorithm / projector / facet JSON / description / 전용 view (fixed-length-stage)
 * 를 함께 번들하고 등록 헬퍼를 제공한다. 코드 패널은 두지 않는다.
 */

export {
  hashFixedLength,
  type HashFixedLengthFacetData,
  type FixedLengthRow,
} from './algorithm.js';
export { hashFixedLengthProjector } from './projector.js';
export { hashFixedLengthIRs } from './irs.js';
export { hashFixedLengthFacet } from './facet.js';
export { hashFixedLengthDescription } from './description.js';
export { fixedLengthStageView } from './fixed-length-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { hashFixedLength, type HashFixedLengthFacetData } from './algorithm.js';
import { hashFixedLengthProjector } from './projector.js';
import { hashFixedLengthIRs } from './irs.js';
import { hashFixedLengthFacet } from './facet.js';
import { hashFixedLengthDescription } from './description.js';
import { fixedLengthStageView } from './fixed-length-stage.js';

export function registerHashFixedLength(): void {
  registerAlgorithm<HashFixedLengthFacetData>('hashFixedLength', hashFixedLength, {
    mechanismKind: 'reactive',
  });
  registerProjector('hashFixedLengthProjector', hashFixedLengthProjector);
  for (const ir of hashFixedLengthIRs) registerIR(ir.id, ir);
  registerView('fixed-length-stage', fixedLengthStageView);
  registerFacets([hashFixedLengthFacet]);
  registerDescription(hashFixedLengthFacet.id, hashFixedLengthDescription);
}
