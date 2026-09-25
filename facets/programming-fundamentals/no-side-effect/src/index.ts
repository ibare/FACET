import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { noSideEffect, type NoSideEffectFacetData } from './algorithm.js';
import { noSideEffectScene } from './scene.js';
import { noSideEffectStageView } from './no-side-effect-stage.js';
import { noSideEffectIRs } from './irs.js';
import { noSideEffectFacet } from './facet.js';

export { noSideEffect, type NoSideEffectFacetData } from './algorithm.js';
export { noSideEffectScene, type NoSideEffectScene } from './scene.js';
export { noSideEffectStageView } from './no-side-effect-stage.js';
export { noSideEffectIRs } from './irs.js';
export { noSideEffectFacet } from './facet.js';

export function registerNoSideEffect(): void {
  registerAlgorithm<NoSideEffectFacetData>('noSideEffect', noSideEffect, { mechanismKind: 'reactive' });
  registerScenePlan('noSideEffectScene', noSideEffectScene);
  for (const ir of noSideEffectIRs) registerIR(ir.id, ir);
  registerView('no-side-effect-stage', noSideEffectStageView);
  registerFacets([noSideEffectFacet]);
}
