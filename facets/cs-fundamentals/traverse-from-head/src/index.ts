/**
 * @ffacet/algorithm-traverse-from-head — 순차 접근 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 여섯 걸음을 자동 재생하고 멈추며, 다시 보기와
 * 한 걸음 두 버튼 외에는 조작을 받지 않는다.
 *
 * `register*` 는 호스트가 부른다 — 이 모듈은 사이드 이펙트를 내지 않는다.
 */

export { traverseFromHead, type TraverseFromHeadData } from './algorithm.js';
export { traverseFromHeadProjector } from './projector.js';
export { traverseFromHeadIRs } from './irs.js';
export { traverseFromHeadFacet } from './facet.js';
export { traverseFromHeadDescription } from './description.js';
export { traverseFromHeadStageView } from './traverse-from-head-stage.js';

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { traverseFromHead, type TraverseFromHeadData } from './algorithm.js';
import { traverseFromHeadProjector } from './projector.js';
import { traverseFromHeadIRs } from './irs.js';
import { traverseFromHeadFacet } from './facet.js';
import { traverseFromHeadDescription } from './description.js';
import { traverseFromHeadStageView } from './traverse-from-head-stage.js';

export function registerTraverseFromHead(): void {
  registerAlgorithm<TraverseFromHeadData>('traverseFromHead', traverseFromHead, {
    mechanismKind: 'reactive',
  });
  registerProjector('traverseFromHeadProjector', traverseFromHeadProjector);
  for (const ir of traverseFromHeadIRs) registerIR(ir.id, ir);
  registerView('traverse-from-head-stage', traverseFromHeadStageView);
  registerFacets([traverseFromHeadFacet]);
  registerDescription(traverseFromHeadFacet.id, traverseFromHeadDescription);
}
