/**
 * critical-path — 등록 진입점.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { criticalPathAlgorithm, type CriticalPathData } from './algorithm.js';
import { criticalPathProjector } from './projector.js';
import { criticalPathIRs } from './irs.js';
import { criticalPathStageView } from './critical-path-stage.js';
import { criticalPathFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './critical-path-stage.js';
export * from './facet.js';

export function registerCriticalPath(): void {
  registerAlgorithm<CriticalPathData>('criticalPath', criticalPathAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('criticalPathProjector', criticalPathProjector);
  for (const ir of criticalPathIRs) registerIR(ir.id, ir);
  registerView('critical-path-stage', criticalPathStageView);
  registerFacets([criticalPathFacet]);
}
