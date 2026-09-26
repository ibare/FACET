import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { graphDbAlgorithm, type GraphDbData } from './algorithm.js';
import { graphDbProjector } from './projector.js';
import { graphDbIRs } from './irs.js';
import { graphDbStageView } from './graph-db-stage.js';
import { graphDbFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './graph-db-stage.js';
export * from './facet.js';

/** graph-db 를 등록한다. 손잡이가 있어 reactive 로 돈다. */
export function registerGraphDb(): void {
  registerAlgorithm<GraphDbData>('graphDb', graphDbAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('graphDbProjector', graphDbProjector);
  for (const ir of graphDbIRs) registerIR(ir.id, ir);
  registerView('graph-db-stage', graphDbStageView);
  registerFacets([graphDbFacet]);
}
