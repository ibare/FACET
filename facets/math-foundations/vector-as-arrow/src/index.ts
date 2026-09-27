import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { vectorAsArrow } from './algorithm.js';
import type { VectorAsArrowFacetData } from './algorithm.js';
import { vectorAsArrowFacet } from './facet.js';
import { vectorAsArrowIRs } from './irs.js';
import { vectorAsArrowScene } from './scene.js';
import { vectorAsArrowStageView } from './vector-as-arrow-stage.js';

export { vectorAsArrow, narrowVectorAsArrowData, arrowAt, readPoint } from './algorithm.js';
export type { VectorAsArrowFacetData, Arrow, Bounds, Pt } from './algorithm.js';
export { vectorAsArrowScene } from './scene.js';
export type {
  VectorAsArrowScene,
  VectorAsArrowBase,
  VectorAsArrowLeg,
  VectorAsArrowStep,
} from './scene.js';
export { vectorAsArrowStageView } from './vector-as-arrow-stage.js';
export { vectorAsArrowIRs } from './irs.js';
export { vectorAsArrowFacet } from './facet.js';

export function registerVectorAsArrow(): void {
  registerAlgorithm<VectorAsArrowFacetData>('vectorAsArrow', vectorAsArrow, { mechanismKind: 'reactive' });
  registerScenePlan('vectorAsArrowScene', vectorAsArrowScene);
  for (const ir of vectorAsArrowIRs) registerIR(ir.id, ir);
  registerView('vector-as-arrow-stage', vectorAsArrowStageView);
  registerFacets([vectorAsArrowFacet]);
}
