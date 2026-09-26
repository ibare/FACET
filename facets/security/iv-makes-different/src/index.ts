import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { ivMakesDifferent, type IvMakesDifferentFacetData } from './algorithm.js';
import { ivMakesDifferentScene } from './scene.js';
import { ivMakesDifferentIRs } from './irs.js';
import { ivMakesDifferentStageView } from './iv-makes-different-stage.js';
import { ivMakesDifferentFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './iv-makes-different-stage.js';
export * from './facet.js';

export function registerIvMakesDifferent(): void {
  registerAlgorithm<IvMakesDifferentFacetData>('ivMakesDifferent', ivMakesDifferent, { mechanismKind: 'reactive' });
  registerScenePlan('ivMakesDifferentScene', ivMakesDifferentScene);
  for (const ir of ivMakesDifferentIRs) registerIR(ir.id, ir);
  registerView('iv-makes-different-stage', ivMakesDifferentStageView);
  registerFacets([ivMakesDifferentFacet]);
}
