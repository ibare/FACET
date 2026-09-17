/**
 * @ffacet/algorithm-bellman-ford — 벨만-포드 완결형 facet 번들.
 *
 * algorithm / projector / IR / facet JSON / 전용 stage view 를
 * 함께 담고 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다 (S-facet).
 */

export {
  bellmanFord,
  computeBellmanFordResult,
  type BellmanFordData,
  type BellmanFordEdge,
} from './algorithm.js';
export { bellmanFordProjector } from './projector.js';
export { bellmanFordRelaxIR, bellmanFordIRs } from './irs.js';
export { bellmanFordFacet } from './facet.js';
export { bellmanFordStageView } from './bellman-ford-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { bellmanFord, type BellmanFordData } from './algorithm.js';
import { bellmanFordProjector } from './projector.js';
import { bellmanFordIRs } from './irs.js';
import { bellmanFordStageView } from './bellman-ford-stage.js';
import { bellmanFordFacet } from './facet.js';

/** algorithm / projector / IR / view / facet 등록 헬퍼. */
export function registerBellmanFord(): void {
  registerAlgorithm<BellmanFordData>('bellmanFord', bellmanFord);
  registerProjector('bellmanFordProjector', bellmanFordProjector);
  for (const ir of bellmanFordIRs) registerIR(ir.id, ir);
  registerView('bellman-ford-stage', bellmanFordStageView);
  registerFacets([bellmanFordFacet]);
}
