/**
 * @ffacet/algorithm-memo-write-once — 메모이제이션 조각 번들.
 *
 * reactive 조각. mount 하면 `f(5)` 를 정의대로 펼치되, 답을 얻은 항은 오른쪽
 * 표로 옮겨 가 적히고 같은 항을 다시 만나면 표에서 값이 되돌아 나온다.
 *
 * 화면은 **장면(Scene)** 으로 만든다 — 이벤트를 상태로 옮기고 `render` 하나가
 * 그 상태에서 화면 전체를 세운다. 그래서 띠로 어느 걸음이든 곧장 짚을 수 있다
 * (S-scene).
 *
 * `register*` 를 사이드 이펙트로 부르지 않는다 — 호출 책임은 호스트 앱에 있다.
 */

export { memoWriteOnce, readMemoTerm, type MemoWriteOnceData } from './algorithm.js';
export {
  memoWriteOnceScene,
  answerOf,
  innermostOpen,
  openCalls,
  reuseLinks,
  reusedCount,
  solvedCount,
  type MemoCall,
  type MemoOutcome,
  type MemoWriteOnceScene,
  type MemoWriteOnceStep,
} from './scene.js';
export { memoWriteOnceIRs } from './irs.js';
export { memoWriteOnceFacet } from './facet.js';
export { memoWriteOnceStageView, MEMO_WRITE_ONCE_STAGE_H } from './memo-write-once-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { memoWriteOnce, type MemoWriteOnceData } from './algorithm.js';
import { memoWriteOnceScene } from './scene.js';
import { memoWriteOnceIRs } from './irs.js';
import { memoWriteOnceFacet } from './facet.js';
import { memoWriteOnceStageView } from './memo-write-once-stage.js';

/**
 * 등록 헬퍼. 순서는 S-facet 표준 (Algorithm → Scene → IR → View → Facets).
 * 전용 View 는 Facets 직전에 끼운다 — facet JSON 의 block.type
 * 이 마운트 시 카탈로그를 조회하기 때문.
 */
export function registerMemoWriteOnce(): void {
  registerAlgorithm<MemoWriteOnceData>('memoWriteOnce', memoWriteOnce, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('memoWriteOnceScene', memoWriteOnceScene);
  for (const ir of memoWriteOnceIRs) registerIR(ir.id, ir);
  registerView('memo-write-once-stage', memoWriteOnceStageView);
  registerFacets([memoWriteOnceFacet]);
}
