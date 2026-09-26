import { registerAlgorithm, registerProjector, registerIR, registerView, registerFacets } from '@ffacet/core/runtime';
import { layoutThrashAlgorithm, type LayoutThrashData } from './algorithm.js';
import { layoutThrashProjector } from './projector.js';
import { layoutThrashIRs } from './irs.js';
import { layoutThrashStageView } from './layout-thrash-stage.js';
import { layoutThrashFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './layout-thrash-stage.js';
export * from './facet.js';

export function registerLayoutThrash(): void {
  registerAlgorithm<LayoutThrashData>('layoutThrash', layoutThrashAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('layoutThrashProjector', layoutThrashProjector);
  for (const ir of layoutThrashIRs) registerIR(ir.id, ir);
  registerView('layout-thrash-stage', layoutThrashStageView);
  registerFacets([layoutThrashFacet]);
}
