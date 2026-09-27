import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { histogramShape, type HistogramShapeFacetData } from './algorithm.js';
import { histogramShapeScene } from './scene.js';
import { histogramShapeStageView } from './histogram-shape-stage.js';
import { histogramShapeIRs } from './irs.js';
import { histogramShapeFacet } from './facet.js';

export { histogramShape, narrowHistogramShapeData } from './algorithm.js';
export type { HistogramShapeFacetData, OrderState } from './algorithm.js';
export { histogramShapeScene } from './scene.js';
export type { HistogramShapeScene, HistogramShapeStep } from './scene.js';
export { histogramShapeStageView } from './histogram-shape-stage.js';
export { histogramShapeIRs } from './irs.js';
export { histogramShapeFacet } from './facet.js';

export function registerHistogramShape(): void {
  registerAlgorithm<HistogramShapeFacetData>('histogramShape', histogramShape, { mechanismKind: 'reactive' });
  registerScenePlan('histogramShapeScene', histogramShapeScene);
  for (const ir of histogramShapeIRs) registerIR(ir.id, ir);
  registerView('histogram-shape-stage', histogramShapeStageView);
  registerFacets([histogramShapeFacet]);
}
