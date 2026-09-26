import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { attendToAllAtOnce, type AttendToAllAtOnceFacetData } from './algorithm.js';
import { attendToAllAtOnceScene } from './scene.js';
import { attendToAllAtOnceStageView } from './attend-to-all-at-once-stage.js';
import { attendToAllAtOnceIRs } from './irs.js';
import { attendToAllAtOnceFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { attendToAllAtOnceStageView } from './attend-to-all-at-once-stage.js';
export { attendToAllAtOnceIRs } from './irs.js';
export { attendToAllAtOnceFacet } from './facet.js';

export function registerAttendToAllAtOnce(): void {
  registerAlgorithm<AttendToAllAtOnceFacetData>('attendToAllAtOnce', attendToAllAtOnce, { mechanismKind: 'reactive' });
  registerScenePlan('attendToAllAtOnceScene', attendToAllAtOnceScene);
  for (const ir of attendToAllAtOnceIRs) registerIR(ir.id, ir);
  registerView('attend-to-all-at-once-stage', attendToAllAtOnceStageView);
  registerFacets([attendToAllAtOnceFacet]);
}
