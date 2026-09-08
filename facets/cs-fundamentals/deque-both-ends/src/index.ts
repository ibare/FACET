/**
 * @ffacet/algorithm-deque-both-ends — 양방향 큐 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 네 조작과 마무리를 자동으로 재생하고 멈추며,
 * 다시 보기와 한 걸음 나아가기 외에는 조작을 받지 않는다.
 */

export { dequeBothEnds, type DequeBothEndsData } from './algorithm.js';
export { dequeBothEndsProjector } from './projector.js';
export { dequeBothEndsIRs } from './irs.js';
export { dequeBothEndsFacet } from './facet.js';
export { dequeBothEndsDescription } from './description.js';
export { dequeBothEndsStageView, type DequeSide } from './deque-both-ends-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { dequeBothEnds, type DequeBothEndsData } from './algorithm.js';
import { dequeBothEndsProjector } from './projector.js';
import { dequeBothEndsIRs } from './irs.js';
import { dequeBothEndsFacet } from './facet.js';
import { dequeBothEndsDescription } from './description.js';
import { dequeBothEndsStageView } from './deque-both-ends-stage.js';

export function registerDequeBothEnds(): void {
  registerAlgorithm<DequeBothEndsData>('dequeBothEnds', dequeBothEnds, {
    mechanismKind: 'reactive',
  });
  registerProjector('dequeBothEndsProjector', dequeBothEndsProjector);
  for (const ir of dequeBothEndsIRs) registerIR(ir.id, ir);
  registerView('deque-both-ends-stage', dequeBothEndsStageView);
  registerFacets([dequeBothEndsFacet]);
  registerDescription(dequeBothEndsFacet.id, dequeBothEndsDescription);
}
