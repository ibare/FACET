/**
 * enqueue-dequeue-ends 조각의 등록 진입점.
 *
 * 화면은 장면(Scene) 방식이다 — projector 대신 `scene.ts` 의 `ScenePlan` 을 등록하고,
 * stage 가 `render` 하나로 산다 (S-scene).
 *
 * 사이드 이펙트로 등록하지 않는다 — 호스트 앱이 `registerEnqueueDequeueEnds()` 를
 * 명시적으로 부른다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { enqueueDequeueEndsAlgorithm } from './algorithm.js';
import type { EnqueueDequeueEndsData } from './algorithm.js';
import { enqueueDequeueEndsScene } from './scene.js';
import { enqueueDequeueEndsIRs } from './irs.js';
import { enqueueDequeueEndsStageView } from './enqueue-dequeue-ends-stage.js';
import { enqueueDequeueEndsFacet } from './facet.js';

export { enqueueDequeueEndsAlgorithm } from './algorithm.js';
export type { EnqueueDequeueEndsData } from './algorithm.js';
export { enqueueDequeueEndsScene } from './scene.js';
export type {
  EnqueueDequeueEndsScene,
  QueueCaption,
  QueueRider,
  QueueStep,
} from './scene.js';
export { enqueueDequeueEndsIRs } from './irs.js';
export { enqueueDequeueEndsStageView } from './enqueue-dequeue-ends-stage.js';
export { enqueueDequeueEndsFacet } from './facet.js';

export function registerEnqueueDequeueEnds(): void {
  registerAlgorithm<EnqueueDequeueEndsData>(
    'enqueueDequeueEnds',
    enqueueDequeueEndsAlgorithm,
    { mechanismKind: 'reactive' },
  );
  registerScenePlan('enqueueDequeueEndsScene', enqueueDequeueEndsScene);
  for (const ir of enqueueDequeueEndsIRs) registerIR(ir.id, ir);
  registerView('enqueue-dequeue-ends-stage', enqueueDequeueEndsStageView);
  registerFacets([enqueueDequeueEndsFacet]);
}
