import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { lostInTheMiddle, type LostInTheMiddleFacetData } from './algorithm.js';
import { lostInTheMiddleScene } from './scene.js';
import { lostInTheMiddleIRs } from './irs.js';
import { lostInTheMiddleStageView } from './lost-in-the-middle-stage.js';
import { lostInTheMiddleFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './lost-in-the-middle-stage.js';
export * from './facet.js';

export function registerLostInTheMiddle(): void {
  registerAlgorithm<LostInTheMiddleFacetData>('lostInTheMiddle', lostInTheMiddle, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('lostInTheMiddleScene', lostInTheMiddleScene);
  for (const ir of lostInTheMiddleIRs) registerIR(ir.id, ir);
  registerView('lost-in-the-middle-stage', lostInTheMiddleStageView);
  registerFacets([lostInTheMiddleFacet]);
}
