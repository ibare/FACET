import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';

import { atomicCell, type AtomicCellFacetData } from './algorithm.js';
import { atomicCellStageView } from './atomic-cell-stage.js';
import { atomicCellFacet } from './facet.js';
import { atomicCellIRs } from './irs.js';
import { atomicCellScene } from './scene.js';

export { atomicCell, type AtomicCellFacetData } from './algorithm.js';
export { atomicCellScene, type AtomicCellScene } from './scene.js';
export { atomicCellStageView } from './atomic-cell-stage.js';
export { atomicCellIRs } from './irs.js';
export { atomicCellFacet } from './facet.js';

export function registerAtomicCell(): void {
  registerAlgorithm<AtomicCellFacetData>('atomicCell', atomicCell, { mechanismKind: 'reactive' });
  registerScenePlan('atomicCellScene', atomicCellScene);
  for (const ir of atomicCellIRs) registerIR(ir.id, ir);
  registerView('atomic-cell-stage', atomicCellStageView);
  registerFacets([atomicCellFacet]);
}
