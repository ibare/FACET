/**
 * 카메라와 투영 — 등록. register 로 시작하는 export 는 registerProjection 하나뿐이다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { projectionAlgorithm, type ProjectionData } from './algorithm.js';
import { projectionFacet } from './facet.js';
import { projectionIRs } from './irs.js';
import { projectionProjector } from './projector.js';
import { projectionStageView } from './projection-stage.js';

export * from './algorithm.js';
export * from './facet.js';
export * from './irs.js';
export * from './projector.js';
export * from './projection-stage.js';

export function registerProjection(): void {
  registerAlgorithm<ProjectionData>('projection', projectionAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('projectionProjector', projectionProjector);
  for (const ir of projectionIRs) registerIR(ir.id, ir);
  registerView('projection-stage', projectionStageView);
  registerFacets([projectionFacet]);
}
