/**
 * @facet/algorithm-queue — 4-layer 큐 (FIFO) facet 번들.
 *
 * 양끝 비대칭 게이트 · 입장 스탬프 단조증가 · 나이 그라디언트 · 동기 시프트 ·
 * 꼬리 로그 · 연산 로그를 한 벨트에 집약한 자료구조 시각화. algorithm /
 * projector / IR / facet JSON / description 을 함께 번들하고 등록 헬퍼를
 * 제공한다.
 */

export { queue, computeQueueResult, type QueueFacetData, type QueueOp } from './algorithm.js';
export { queueProjector } from './projector.js';
export { queueImperativeIR, queueIRs } from './irs.js';
export { queueFacet } from './facet.js';
export { queueDescription } from './description.js';

import {
  registerAlgorithm,
  registerProjector,
  registerFacets,
  registerIR,
  registerDescription,
} from '@facet/core/runtime';
import { queue, type QueueFacetData } from './algorithm.js';
import { queueProjector } from './projector.js';
import { queueIRs } from './irs.js';
import { queueFacet } from './facet.js';
import { queueDescription } from './description.js';

/** algorithm/projector/IR/facet/description 등록 헬퍼 (transpiler 는 호스트가 별도 등록). */
export function registerQueue(): void {
  registerAlgorithm<QueueFacetData>('queue', queue);
  registerProjector('queueProjector', queueProjector);
  for (const ir of queueIRs) registerIR(ir.id, ir);
  registerFacets([queueFacet]);
  registerDescription(queueFacet.id, queueDescription);
}
