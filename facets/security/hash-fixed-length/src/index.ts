/**
 * @ffacet/algorithm-hash-fixed-length — 고정 길이 출력 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 세 걸음을 자동 재생하고 정지하며, 다시 보기와 띠
 * 외에는 조작을 받지 않는다. ReactiveMechanism 이라 컨트롤바 없이 스스로 재생하고
 * 걸음 간격도 스스로 정한다 (ctx.sleep).
 *
 * 화면은 명령이 아니라 **장면**에서 만들어지므로 어느 걸음으로든 곧장 갈 수 있다
 * (S-scene). algorithm / scene / facet JSON / description / 전용 view
 * (fixed-length-stage) 를 함께 번들하고 등록 헬퍼를 제공한다. 코드 패널은 두지 않는다.
 */

export {
  hashFixedLength,
  type HashFixedLengthFacetData,
  type FixedLengthRow,
} from './algorithm.js';
export {
  hashFixedLengthScene,
  captionOf,
  longestBytesOf,
  outputBitsOf,
  uniformHexDigitsOf,
  type FixedLengthCaption,
  type FixedLengthSceneRow,
  type FixedLengthStep,
  type HashFixedLengthScene,
} from './scene.js';
export { hashFixedLengthIRs } from './irs.js';
export { hashFixedLengthFacet } from './facet.js';
export { hashFixedLengthDescription } from './description.js';
export { fixedLengthStageView } from './fixed-length-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { hashFixedLength, type HashFixedLengthFacetData } from './algorithm.js';
import { hashFixedLengthScene } from './scene.js';
import { hashFixedLengthIRs } from './irs.js';
import { hashFixedLengthFacet } from './facet.js';
import { hashFixedLengthDescription } from './description.js';
import { fixedLengthStageView } from './fixed-length-stage.js';

export function registerHashFixedLength(): void {
  registerAlgorithm<HashFixedLengthFacetData>('hashFixedLength', hashFixedLength, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('hashFixedLengthScene', hashFixedLengthScene);
  for (const ir of hashFixedLengthIRs) registerIR(ir.id, ir);
  registerView('fixed-length-stage', fixedLengthStageView);
  registerFacets([hashFixedLengthFacet]);
  registerDescription(hashFixedLengthFacet.id, hashFixedLengthDescription);
}
