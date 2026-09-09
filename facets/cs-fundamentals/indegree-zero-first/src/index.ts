/**
 * @ffacet/algorithm-indegree-zero-first — 진입 차수 조각(piece) facet 번들.
 *
 * 한 주장만 말한다. 자동 재생으로 다섯 정점이 순서대로 떨어져 나오는 것을
 * 보이고 멈추며, 다시 보기와 한 걸음씩 짚기 외에는 조작을 받지 않는다.
 *
 * `register*` 는 호스트가 부른다. 이 모듈이 스스로 부르지 않는다 (S-facet).
 */

export {
  indegreeZeroFirstAlgorithm,
  type IndegreeZeroFirstData,
  type IndegreeEdge,
} from './algorithm.js';
export { indegreeZeroFirstProjector } from './projector.js';
export { indegreeZeroFirstIRs } from './irs.js';
export { indegreeZeroFirstFacet } from './facet.js';
export { indegreeZeroFirstDescription } from './description.js';
export { indegreeZeroFirstStageView } from './indegree-zero-first-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { indegreeZeroFirstAlgorithm, type IndegreeZeroFirstData } from './algorithm.js';
import { indegreeZeroFirstProjector } from './projector.js';
import { indegreeZeroFirstIRs } from './irs.js';
import { indegreeZeroFirstFacet } from './facet.js';
import { indegreeZeroFirstDescription } from './description.js';
import { indegreeZeroFirstStageView } from './indegree-zero-first-stage.js';

export function registerIndegreeZeroFirst(): void {
  registerAlgorithm<IndegreeZeroFirstData>('indegreeZeroFirst', indegreeZeroFirstAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('indegreeZeroFirstProjector', indegreeZeroFirstProjector);
  for (const ir of indegreeZeroFirstIRs) registerIR(ir.id, ir);
  registerView('indegree-zero-first-stage', indegreeZeroFirstStageView);
  registerFacets([indegreeZeroFirstFacet]);
  registerDescription(indegreeZeroFirstFacet.id, indegreeZeroFirstDescription);
}
