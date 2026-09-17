/**
 * facet:skipList 의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 등록하지 않는다 — `registerSkipList()` 를 부르는 것은
 * 호스트 앱의 몫이다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { skipListAlgorithm } from './algorithm.js';
import { skipListProjector } from './projector.js';
import { skipListIRs } from './irs.js';
import { skipListStageView } from './skip-list-stage.js';
import { skipListFacet } from './facet.js';

export type { SkipListData, SkipListShape, SkipListStep, SkipListPoint } from './algorithm.js';
export {
  skipListAlgorithm,
  buildSkipList,
  searchSkipList,
  looksFor,
  averageLooks,
  SKIP_LIST_NS,
} from './algorithm.js';
export { skipListProjector } from './projector.js';
export { skipListIRs } from './irs.js';
export { skipListStageView } from './skip-list-stage.js';
export { skipListFacet } from './facet.js';

export function registerSkipList(): void {
  // 손잡이를 가진 완제품이라 reactive 다 — 원소 수를 바꾸면 알고리즘이 그
  // 입력을 받아 처음부터 다시 짓는다.
  registerAlgorithm('skipList', skipListAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('skipListProjector', skipListProjector);
  for (const ir of skipListIRs) registerIR(ir.id, ir);
  registerView('skip-list-stage', skipListStageView);
  registerFacets([skipListFacet]);
}
