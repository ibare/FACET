import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { pointAddOnCurve, type PointAddOnCurveFacetData } from './algorithm.js';
import { pointAddOnCurveScene } from './scene.js';
import { pointAddOnCurveStageView } from './point-add-on-curve-stage.js';
import { pointAddOnCurveIRs } from './irs.js';
import { pointAddOnCurveFacet } from './facet.js';

export { pointAddOnCurve, narrowPointAddData, curveRhs } from './algorithm.js';
export type { PointAddOnCurveFacetData, CurvePoint } from './algorithm.js';
export { pointAddOnCurveScene } from './scene.js';
export type { PointAddScene, PointAddBase, PointAddLine, PointAddSum, PointAddStep } from './scene.js';
export { pointAddOnCurveStageView } from './point-add-on-curve-stage.js';
export { pointAddOnCurveIRs } from './irs.js';
export { pointAddOnCurveFacet } from './facet.js';

export function registerPointAddOnCurve(): void {
  registerAlgorithm<PointAddOnCurveFacetData>('pointAddOnCurve', pointAddOnCurve, { mechanismKind: 'reactive' });
  registerScenePlan('pointAddOnCurveScene', pointAddOnCurveScene);
  for (const ir of pointAddOnCurveIRs) registerIR(ir.id, ir);
  registerView('point-add-on-curve-stage', pointAddOnCurveStageView);
  registerFacets([pointAddOnCurveFacet]);
}
