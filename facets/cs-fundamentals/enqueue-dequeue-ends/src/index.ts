/**
 * enqueue-dequeue-ends 조각의 등록 진입점.
 *
 * 사이드 이펙트로 등록하지 않는다 — 호스트 앱이 `registerEnqueueDequeueEnds()` 를
 * 명시적으로 부른다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { enqueueDequeueEndsAlgorithm } from './algorithm.js';
import type { EnqueueDequeueEndsData } from './algorithm.js';
import { enqueueDequeueEndsProjector } from './projector.js';
import { enqueueDequeueEndsIRs } from './irs.js';
import { enqueueDequeueEndsStageView } from './enqueue-dequeue-ends-stage.js';
import { enqueueDequeueEndsFacet } from './facet.js';
import { enqueueDequeueEndsDescription } from './description.js';

export { enqueueDequeueEndsAlgorithm } from './algorithm.js';
export type { EnqueueDequeueEndsData } from './algorithm.js';
export { enqueueDequeueEndsProjector } from './projector.js';
export { enqueueDequeueEndsIRs } from './irs.js';
export { enqueueDequeueEndsStageView } from './enqueue-dequeue-ends-stage.js';
export { enqueueDequeueEndsFacet } from './facet.js';
export { enqueueDequeueEndsDescription } from './description.js';

export function registerEnqueueDequeueEnds(): void {
  registerAlgorithm<EnqueueDequeueEndsData>(
    'enqueueDequeueEnds',
    enqueueDequeueEndsAlgorithm,
    { mechanismKind: 'reactive' },
  );
  registerProjector('enqueueDequeueEndsProjector', enqueueDequeueEndsProjector);
  for (const ir of enqueueDequeueEndsIRs) registerIR(ir.id, ir);
  registerView('enqueue-dequeue-ends-stage', enqueueDequeueEndsStageView);
  registerFacets([enqueueDequeueEndsFacet]);
  registerDescription(enqueueDequeueEndsFacet.id, enqueueDequeueEndsDescription);
}
