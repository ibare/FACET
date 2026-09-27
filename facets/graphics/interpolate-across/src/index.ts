import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { interpolateAcross, type InterpolateAcrossFacetData } from './algorithm.js';
import { interpolateAcrossFacet } from './facet.js';
import { interpolateAcrossStageView } from './interpolate-across-stage.js';
import { interpolateAcrossIRs } from './irs.js';
import { interpolateAcrossScene } from './scene.js';

export {
  edgeFn,
  interpolateAcross,
  levelSegment,
  narrowInterpolateAcrossData,
  type InterpolateAcrossFacetData,
  type Rgb,
  type Vertex,
} from './algorithm.js';
export { interpolateAcrossFacet } from './facet.js';
export { interpolateAcrossStageView } from './interpolate-across-stage.js';
export { interpolateAcrossIRs } from './irs.js';
export {
  interpolateAcrossScene,
  type InsideCell,
  type InterpolateAcrossScene,
  type InterpolateAcrossStep,
} from './scene.js';

export function registerInterpolateAcross(): void {
  registerAlgorithm<InterpolateAcrossFacetData>('interpolateAcross', interpolateAcross, { mechanismKind: 'reactive' });
  registerScenePlan('interpolateAcrossScene', interpolateAcrossScene);
  for (const ir of interpolateAcrossIRs) registerIR(ir.id, ir);
  registerView('interpolate-across-stage', interpolateAcrossStageView);
  registerFacets([interpolateAcrossFacet]);
}
