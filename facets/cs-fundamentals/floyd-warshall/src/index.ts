/**
 * 플로이드-워셜 facet 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 호출은 호스트 앱의 몫이다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { floydWarshallAlgorithm } from './algorithm.js';
import type { FloydWarshallData } from './algorithm.js';
import { floydWarshallProjector } from './projector.js';
import { floydWarshallIRs } from './irs.js';
import { floydWarshallStageView } from './floyd-warshall-stage.js';
import { floydWarshallFacet } from './facet.js';
import { floydWarshallDescription } from './description.js';

export {
  floydWarshallAlgorithm,
  computeFloydWarshallTable,
  FLOYD_WARSHALL_INF,
} from './algorithm.js';
export type {
  FloydWarshallData,
  FloydWarshallEdge,
} from './algorithm.js';
export { floydWarshallProjector } from './projector.js';
export { floydWarshallIRs, floydWarshallTripleIR } from './irs.js';
export { floydWarshallStageView } from './floyd-warshall-stage.js';
export { floydWarshallFacet } from './facet.js';
export { floydWarshallDescription } from './description.js';

export function registerFloydWarshall(): void {
  registerAlgorithm<FloydWarshallData>('floydWarshall', floydWarshallAlgorithm);
  registerProjector('floydWarshallProjector', floydWarshallProjector);
  for (const ir of floydWarshallIRs) registerIR(ir.id, ir);
  registerView('floyd-warshall-stage', floydWarshallStageView);
  registerFacets([floydWarshallFacet]);
  registerDescription(floydWarshallFacet.id, floydWarshallDescription);
}
