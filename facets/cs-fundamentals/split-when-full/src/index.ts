/**
 * @ffacet/algorithm-split-when-full — 노드 분할 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 네 걸음(descend → overflow → promote → divide)을
 * 자동 재생하고 멈춘 뒤, 다시 보기와 한 걸음(advance)만 받는다.
 */

export {
  splitWhenFull,
  type SplitWhenFullData,
  type SplitWhenFullNode,
  type DescendPayload,
  type OverflowPayload,
  type PromotePayload,
  type DividePayload,
} from './algorithm.js';
export { splitWhenFullProjector } from './projector.js';
export { splitWhenFullIRs } from './irs.js';
export { splitWhenFullFacet } from './facet.js';
export { splitWhenFullDescription } from './description.js';
export { splitWhenFullStageView, type SplitWhenFullStageInstance } from './split-when-full-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { splitWhenFull, type SplitWhenFullData } from './algorithm.js';
import { splitWhenFullProjector } from './projector.js';
import { splitWhenFullIRs } from './irs.js';
import { splitWhenFullFacet } from './facet.js';
import { splitWhenFullDescription } from './description.js';
import { splitWhenFullStageView } from './split-when-full-stage.js';

export function registerSplitWhenFull(): void {
  registerAlgorithm<SplitWhenFullData>('splitWhenFull', splitWhenFull, {
    mechanismKind: 'reactive',
  });
  registerProjector('splitWhenFullProjector', splitWhenFullProjector);
  for (const ir of splitWhenFullIRs) registerIR(ir.id, ir);
  registerView('split-when-full-stage', splitWhenFullStageView);
  registerFacets([splitWhenFullFacet]);
  registerDescription(splitWhenFullFacet.id, splitWhenFullDescription);
}
