/**
 * @ffacet/algorithm-conflict-miss — 충돌 실패 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 주소 여섯을 자동으로 찾아 보이고 멈추며, 다 보고 난
 * 뒤에는 띠를 끌어 어느 걸음으로든 곧장 갈 수 있다. ReactiveMechanism 이라
 * 컨트롤바 없이 스스로 재생하고, 걸음 간격도 스스로 정한다 (ctx.sleep).
 *
 * algorithm / 장면 설계 / facet JSON / 전용 view
 * (conflict-miss-stage) 를 함께 번들하고 등록 헬퍼를 제공한다. 코드 패널은
 * 두지 않는다.
 *
 * 등록 이름은 algorithm 과 장면이 서로 다르다 — `module:X` 참조만 보고 그것이
 * 어느 쪽인지 알 수 있어야 한다 (C4, `register-names.test.ts`).
 *
 * 부르는 책임은 호스트 앱에 있다 — 이 모듈은 사이드 이펙트로 스스로 등록하지
 * 않는다 (S-facet).
 */

export { conflictMiss, type ConflictMissFacetData } from './algorithm.js';
export { conflictMissScene } from './scene.js';
export type {
  AccessVerdict,
  CacheAccess,
  CacheReplay,
  ConflictMissCaption,
  ConflictMissScene,
  ConflictMissStep,
  LineResident,
} from './scene.js';
export {
  askedLinesOf,
  emptyIndicesOf,
  evictedByLineOf,
  hitCountOf,
  replayOf,
} from './scene.js';
export { conflictMissIRs } from './irs.js';
export { conflictMissFacet } from './facet.js';
export { conflictMissStageView } from './conflict-miss-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { conflictMiss, type ConflictMissFacetData } from './algorithm.js';
import { conflictMissScene } from './scene.js';
import { conflictMissIRs } from './irs.js';
import { conflictMissFacet } from './facet.js';
import { conflictMissStageView } from './conflict-miss-stage.js';

export function registerConflictMiss(): void {
  registerAlgorithm<ConflictMissFacetData>('conflictMiss', conflictMiss, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('conflictMissScene', conflictMissScene);
  for (const ir of conflictMissIRs) registerIR(ir.id, ir);
  registerView('conflict-miss-stage', conflictMissStageView);
  registerFacets([conflictMissFacet]);
}
