import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { eraseTheImpossible, type EraseTheImpossibleFacetData } from './algorithm.js';
import { eraseTheImpossibleScene } from './scene.js';
import { eraseTheImpossibleIRs } from './irs.js';
import { eraseTheImpossibleStageView } from './erase-the-impossible-stage.js';
import { eraseTheImpossibleFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './erase-the-impossible-stage.js';
export * from './facet.js';

export function registerEraseTheImpossible(): void {
  registerAlgorithm<EraseTheImpossibleFacetData>('eraseTheImpossible', eraseTheImpossible, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('eraseTheImpossibleScene', eraseTheImpossibleScene);
  for (const ir of eraseTheImpossibleIRs) registerIR(ir.id, ir);
  registerView('erase-the-impossible-stage', eraseTheImpossibleStageView);
  registerFacets([eraseTheImpossibleFacet]);
}
