/**
 * @facet/algorithm-bst — 4-layer 알고리즘 모듈.
 *
 * tree-layout 의 첫 소비처로서 좌소우대 색지 + 폴드 + 경로 조명 +
 * inorder 바닥선 + 기울기 게이지 + 보조 커서 + ghost probe 를 한 번에
 * 조율. 본 모듈은 algorithm / projector / IR / facet JSON / description 을
 * 번들해 export + 등록 헬퍼를 제공한다.
 */

export {
  bst,
  computeInitialBst,
  computeBstResult,
  type BstInitialData,
  type BstOperation,
} from './algorithm.js';
export { bstProjector, BST_CANVAS } from './projector.js';
export { bstRecursiveIR, bstIterativeIR, bstIRs } from './irs.js';
export { bstFacet } from './facet.js';
export { bstDescription } from './description.js';

import {
  registerAlgorithm,
  registerProjector,
  registerFacets,
  registerIR,
  registerDescription,
} from '@facet/core/runtime';
import { bst, type BstInitialData } from './algorithm.js';
import { bstProjector } from './projector.js';
import { bstIRs } from './irs.js';
import { bstFacet } from './facet.js';
import { bstDescription } from './description.js';

/** algorithm/projector/IR/facet/description 등록 헬퍼 (transpiler 는 호스트가 별도 등록). */
export function registerBst(): void {
  registerAlgorithm<BstInitialData>('bst', bst);
  registerProjector('bstProjector', bstProjector);
  for (const ir of bstIRs) registerIR(ir.id, ir);
  registerFacets([bstFacet]);
  registerDescription(bstFacet.id, bstDescription);
}
