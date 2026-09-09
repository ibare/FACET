/**
 * @ffacet/algorithm-mark-visited-or-loop — 방문 표시 조각(piece) 번들.
 *
 * algorithm / projector / IR(빈 배열) / facet JSON / description / 전용 stage view 를
 * 함께 담고 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다 (S-facet).
 */

export { markVisitedOrLoop, type MarkVisitedOrLoopData } from './algorithm.js';
export { markVisitedOrLoopProjector } from './projector.js';
export { markVisitedOrLoopIRs } from './irs.js';
export { markVisitedOrLoopFacet } from './facet.js';
export { markVisitedOrLoopDescription } from './description.js';
export {
  markVisitedOrLoopStageView,
  type MarkVisitedOrLoopStageInstance,
} from './mark-visited-or-loop-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { markVisitedOrLoop, type MarkVisitedOrLoopData } from './algorithm.js';
import { markVisitedOrLoopProjector } from './projector.js';
import { markVisitedOrLoopIRs } from './irs.js';
import { markVisitedOrLoopStageView } from './mark-visited-or-loop-stage.js';
import { markVisitedOrLoopFacet } from './facet.js';
import { markVisitedOrLoopDescription } from './description.js';

/** algorithm / projector / IR / view / facet / description 등록 헬퍼. */
export function registerMarkVisitedOrLoop(): void {
  registerAlgorithm<MarkVisitedOrLoopData>('markVisitedOrLoop', markVisitedOrLoop, {
    // 조각은 컨트롤바 없이도 스스로 시작하고 걸음 간격을 스스로 정해야 한다 (S-piece).
    mechanismKind: 'reactive',
  });
  registerProjector('markVisitedOrLoopProjector', markVisitedOrLoopProjector);
  for (const ir of markVisitedOrLoopIRs) registerIR(ir.id, ir);
  registerView('mark-visited-or-loop-stage', markVisitedOrLoopStageView);
  registerFacets([markVisitedOrLoopFacet]);
  registerDescription(markVisitedOrLoopFacet.id, markVisitedOrLoopDescription);
}
