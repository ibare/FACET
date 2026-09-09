/**
 * relaxShorterPath 조각의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 등록하지 않는다 — 부르는 것은 호스트의 몫이다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { relaxShorterPathAlgorithm, type RelaxShorterPathData } from './algorithm.js';
import { relaxShorterPathProjector } from './projector.js';
import { relaxShorterPathIRs } from './irs.js';
import { relaxShorterPathStageView } from './relax-shorter-path-stage.js';
import { relaxShorterPathFacet } from './facet.js';
import { relaxShorterPathDescription } from './description.js';

export { relaxShorterPathAlgorithm } from './algorithm.js';
export type { RelaxShorterPathData, RelaxEdge } from './algorithm.js';
export { relaxShorterPathProjector } from './projector.js';
export { relaxShorterPathIRs } from './irs.js';
export { relaxShorterPathStageView } from './relax-shorter-path-stage.js';
export { relaxShorterPathFacet } from './facet.js';
export { relaxShorterPathDescription } from './description.js';

export function registerRelaxShorterPath(): void {
  registerAlgorithm<RelaxShorterPathData>('relaxShorterPath', relaxShorterPathAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('relaxShorterPathProjector', relaxShorterPathProjector);
  for (const ir of relaxShorterPathIRs) registerIR(ir.id, ir);
  registerView('relax-shorter-path-stage', relaxShorterPathStageView);
  registerFacets([relaxShorterPathFacet]);
  registerDescription(relaxShorterPathFacet.id, relaxShorterPathDescription);
}
