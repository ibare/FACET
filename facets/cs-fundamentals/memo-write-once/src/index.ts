/**
 * @ffacet/algorithm-memo-write-once — 메모이제이션 조각 번들.
 *
 * reactive 조각. mount 하면 `f(5)` 를 정의대로 펼치되, 답을 얻은 항은 오른쪽
 * 표로 옮겨 가 적히고 같은 항을 다시 만나면 표에서 값이 되돌아 나온다.
 *
 * `register*` 를 사이드 이펙트로 부르지 않는다 — 호출 책임은 호스트 앱에 있다.
 */

export { memoWriteOnce, type MemoWriteOnceData } from './algorithm.js';
export { memoWriteOnceProjector } from './projector.js';
export { memoWriteOnceIRs } from './irs.js';
export { memoWriteOnceFacet } from './facet.js';
export { memoWriteOnceDescription } from './description.js';
export {
  memoWriteOnceStageView,
  MEMO_WRITE_ONCE_STAGE_H,
  type MemoBranchSpec,
  type MemoWriteOnceStageInstance,
} from './memo-write-once-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { memoWriteOnce, type MemoWriteOnceData } from './algorithm.js';
import { memoWriteOnceProjector } from './projector.js';
import { memoWriteOnceIRs } from './irs.js';
import { memoWriteOnceFacet } from './facet.js';
import { memoWriteOnceDescription } from './description.js';
import { memoWriteOnceStageView } from './memo-write-once-stage.js';

/**
 * 등록 헬퍼. 순서는 S-facet 표준 (Algorithm → Projector → IR → View → Facets
 * → Description). 전용 View 는 Facets 직전에 끼운다 — facet JSON 의 block.type
 * 이 마운트 시 카탈로그를 조회하기 때문.
 */
export function registerMemoWriteOnce(): void {
  registerAlgorithm<MemoWriteOnceData>('memoWriteOnce', memoWriteOnce, {
    mechanismKind: 'reactive',
  });
  registerProjector('memoWriteOnceProjector', memoWriteOnceProjector);
  for (const ir of memoWriteOnceIRs) registerIR(ir.id, ir);
  registerView('memo-write-once-stage', memoWriteOnceStageView);
  registerFacets([memoWriteOnceFacet]);
  registerDescription(memoWriteOnceFacet.id, memoWriteOnceDescription);
}
