import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { compositeIndexAlgorithm, type CompositeIndexData } from './algorithm.js';
import { compositeIndexFacet } from './facet.js';
import { compositeIndexIRs } from './irs.js';
import { compositeIndexProjector } from './projector.js';
import { compositeIndexStageView } from './composite-index-stage.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './composite-index-stage.js';
export * from './facet.js';

export function registerCompositeIndex(): void {
  registerAlgorithm<CompositeIndexData>('compositeIndex', compositeIndexAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('compositeIndexProjector', compositeIndexProjector);
  for (const ir of compositeIndexIRs) registerIR(ir.id, ir);
  registerView('composite-index-stage', compositeIndexStageView);
  registerFacets([compositeIndexFacet]);
}
