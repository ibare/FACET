/**
 * eigen — 등록 진입점. 손잡이가 있으므로 reactive 로 등록한다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { eigenAlgorithm, type EigenData } from './algorithm.js';
import { eigenProjector } from './projector.js';
import { eigenIRs } from './irs.js';
import { eigenStageView } from './eigen-stage.js';
import { eigenFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './eigen-stage.js';
export * from './facet.js';

export function registerEigen(): void {
  registerAlgorithm<EigenData>('eigen', eigenAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('eigenProjector', eigenProjector);
  for (const ir of eigenIRs) registerIR(ir.id, ir);
  registerView('eigen-stage', eigenStageView);
  registerFacets([eigenFacet]);
}
