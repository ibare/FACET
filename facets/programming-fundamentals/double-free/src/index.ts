import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { doubleFree, type DoubleFreeFacetData } from './algorithm.js';
import { doubleFreeScene } from './scene.js';
import { doubleFreeStageView } from './double-free-stage.js';
import { doubleFreeIRs } from './irs.js';
import { doubleFreeFacet } from './facet.js';

export { doubleFree, type DoubleFreeFacetData } from './algorithm.js';
export { doubleFreeScene, type DoubleFreeScene } from './scene.js';
export { doubleFreeStageView } from './double-free-stage.js';
export { doubleFreeIRs } from './irs.js';
export { doubleFreeFacet } from './facet.js';

export function registerDoubleFree(): void {
  registerAlgorithm<DoubleFreeFacetData>('doubleFree', doubleFree, { mechanismKind: 'reactive' });
  registerScenePlan('doubleFreeScene', doubleFreeScene);
  for (const ir of doubleFreeIRs) registerIR(ir.id, ir);
  registerView('double-free-stage', doubleFreeStageView);
  registerFacets([doubleFreeFacet]);
}
