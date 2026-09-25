import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { timeSliceRotate, type TimeSliceRotateFacetData } from './algorithm.js';
import { timeSliceRotateScene } from './scene.js';
import { timeSliceRotateStageView } from './time-slice-rotate-stage.js';
import { timeSliceRotateIRs } from './irs.js';
import { timeSliceRotateFacet } from './facet.js';

export {
  timeSliceRotate,
  readRotateData,
  type TimeSliceRotateFacetData,
  type RotateProcData,
} from './algorithm.js';
export {
  timeSliceRotateScene,
  type TimeSliceRotateScene,
  type RotateProc,
  type RotateStep,
  type RotateWhere,
} from './scene.js';
export { timeSliceRotateStageView } from './time-slice-rotate-stage.js';
export { timeSliceRotateIRs } from './irs.js';
export { timeSliceRotateFacet } from './facet.js';

export function registerTimeSliceRotate(): void {
  registerAlgorithm<TimeSliceRotateFacetData>('timeSliceRotate', timeSliceRotate, { mechanismKind: 'reactive' });
  registerScenePlan('timeSliceRotateScene', timeSliceRotateScene);
  for (const ir of timeSliceRotateIRs) registerIR(ir.id, ir);
  registerView('time-slice-rotate-stage', timeSliceRotateStageView);
  registerFacets([timeSliceRotateFacet]);
}
