/**
 * @ffacet/algorithm-dijkstra — 다익스트라 최단 경로 완결형 facet 번들.
 *
 * algorithm / projector / IR / facet JSON / description / 전용 stage view 를
 * 함께 담고 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다 (S-facet).
 */

export { dijkstra, type DijkstraData, type DijkstraEdge } from './algorithm.js';
export { dijkstraProjector } from './projector.js';
export { dijkstraSettleIR, dijkstraIRs } from './irs.js';
export { dijkstraFacet } from './facet.js';
export { dijkstraDescription } from './description.js';
export { dijkstraStageView, type DijkstraSnapshot } from './dijkstra-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { dijkstra, type DijkstraData } from './algorithm.js';
import { dijkstraProjector } from './projector.js';
import { dijkstraIRs } from './irs.js';
import { dijkstraStageView } from './dijkstra-stage.js';
import { dijkstraFacet } from './facet.js';
import { dijkstraDescription } from './description.js';

/** algorithm / projector / IR / view / facet / description 등록 헬퍼. */
export function registerDijkstra(): void {
  registerAlgorithm<DijkstraData>('dijkstra', dijkstra);
  registerProjector('dijkstraProjector', dijkstraProjector);
  for (const ir of dijkstraIRs) registerIR(ir.id, ir);
  registerView('dijkstra-stage', dijkstraStageView);
  registerFacets([dijkstraFacet]);
  registerDescription(dijkstraFacet.id, dijkstraDescription);
}
