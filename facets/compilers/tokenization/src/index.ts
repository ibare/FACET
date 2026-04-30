/**
 * @facet/algorithm-tokenization — 토큰화 (어휘 분석) facet 번들.
 *
 * 입력 반응형 (ReactiveMechanism). mount 직후 한 박자씩 자동 스캔이 흐르고,
 * 끝나면 waitForInput 으로 다음 사용자 액션을 대기한다. 컨트롤바는 next-example +
 * replay + speed-slider + reset.
 *
 * algorithm / projector / facet JSON / description / 전용 view (tokenization-stage)
 * 를 함께 번들하고 등록 헬퍼를 제공한다. 코드 패널은 1차 구현에서 생략.
 */

export {
  tokenization,
  type TokenizationFacetData,
  type TokenizationInputEvent,
  type TokenizationExample,
  type TokenKind,
  type SwallowKind,
  type Token,
  type KindPalette,
} from './algorithm.js';
export { tokenizationProjector } from './projector.js';
export { tokenizationIRs } from './irs.js';
export { tokenizationFacet } from './facet.js';
export { tokenizationDescription } from './description.js';
export { tokenizationStageView } from './tokenization-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@facet/core/runtime';
import { tokenization, type TokenizationFacetData } from './algorithm.js';
import { tokenizationProjector } from './projector.js';
import { tokenizationIRs } from './irs.js';
import { tokenizationFacet } from './facet.js';
import { tokenizationDescription } from './description.js';
import { tokenizationStageView } from './tokenization-stage.js';

export function registerTokenization(): void {
  registerAlgorithm<TokenizationFacetData>('tokenization', tokenization, {
    mechanismKind: 'reactive',
  });
  registerProjector('tokenizationProjector', tokenizationProjector);
  for (const ir of tokenizationIRs) registerIR(ir.id, ir);
  registerView('tokenization-stage', tokenizationStageView);
  registerFacets([tokenizationFacet]);
  registerDescription(tokenizationFacet.id, tokenizationDescription);
}
