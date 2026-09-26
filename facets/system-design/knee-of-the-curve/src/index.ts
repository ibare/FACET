import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { kneeOfTheCurve, type KneeOfTheCurveFacetData } from './algorithm.js';
import { kneeOfTheCurveScene } from './scene.js';
import { kneeOfTheCurveStageView } from './knee-of-the-curve-stage.js';
import { kneeOfTheCurveIRs } from './irs.js';
import { kneeOfTheCurveFacet } from './facet.js';

export { kneeOfTheCurve, narrowKneeData, timeInSystemMs } from './algorithm.js';
export type { KneeOfTheCurveFacetData } from './algorithm.js';
export { kneeOfTheCurveScene } from './scene.js';
export type { KneeAxis, KneePoint, KneeScene, KneeStep } from './scene.js';
export { kneeOfTheCurveStageView } from './knee-of-the-curve-stage.js';
export { kneeOfTheCurveIRs } from './irs.js';
export { kneeOfTheCurveFacet } from './facet.js';

export function registerKneeOfTheCurve(): void {
  registerAlgorithm<KneeOfTheCurveFacetData>('kneeOfTheCurve', kneeOfTheCurve, { mechanismKind: 'reactive' });
  registerScenePlan('kneeOfTheCurveScene', kneeOfTheCurveScene);
  for (const ir of kneeOfTheCurveIRs) registerIR(ir.id, ir);
  registerView('knee-of-the-curve-stage', kneeOfTheCurveStageView);
  registerFacets([kneeOfTheCurveFacet]);
}
