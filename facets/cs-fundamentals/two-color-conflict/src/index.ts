/**
 * 등록 진입점. 사이드 이펙트로 스스로 부르지 않는다 — 호출은 호스트의 몫이다
 * (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { twoColorConflictAlgorithm, type TwoColorConflictData } from './algorithm.js';
import { twoColorConflictProjector } from './projector.js';
import { twoColorConflictIRs } from './irs.js';
import { twoColorConflictStageView } from './two-color-conflict-stage.js';
import { twoColorConflictFacet } from './facet.js';
import { twoColorConflictDescription } from './description.js';

export { twoColorConflictAlgorithm, computeTwoColorWalk } from './algorithm.js';
export type { TwoColorConflictData, TwoColorEdge, TwoColorWalk } from './algorithm.js';
export { twoColorConflictProjector } from './projector.js';
export { twoColorConflictIRs } from './irs.js';
export { twoColorConflictStageView } from './two-color-conflict-stage.js';
export { twoColorConflictFacet } from './facet.js';
export { twoColorConflictDescription } from './description.js';

export function registerTwoColorConflict(): void {
  registerAlgorithm<TwoColorConflictData>('twoColorConflict', twoColorConflictAlgorithm, {
    // 조각은 마운트 즉시 스스로 재생하고 걸음 간격을 스스로 정한다 (S-piece).
    mechanismKind: 'reactive',
  });
  registerProjector('twoColorConflictProjector', twoColorConflictProjector);
  for (const ir of twoColorConflictIRs) registerIR(ir.id, ir);
  registerView('two-color-conflict-stage', twoColorConflictStageView);
  registerFacets([twoColorConflictFacet]);
  registerDescription(twoColorConflictFacet.id, twoColorConflictDescription);
}
