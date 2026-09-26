import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { assignOnce, type AssignOnceFacetData } from './algorithm.js';
import { assignOnceScene } from './scene.js';
import { assignOnceIRs } from './irs.js';
import { assignOnceStageView } from './assign-once-stage.js';
import { assignOnceFacet } from './facet.js';

export { assignOnce, type AssignOnceFacetData, type Instr, type Operand } from './algorithm.js';
export {
  assignOnceScene,
  type AssignOnceScene,
  type Renamed,
  type Ver,
  type NameInfo,
} from './scene.js';
export { assignOnceIRs } from './irs.js';
export { assignOnceStageView } from './assign-once-stage.js';
export { assignOnceFacet } from './facet.js';

export function registerAssignOnce(): void {
  registerAlgorithm<AssignOnceFacetData>('assignOnce', assignOnce, { mechanismKind: 'reactive' });
  registerScenePlan('assignOnceScene', assignOnceScene);
  for (const ir of assignOnceIRs) registerIR(ir.id, ir);
  registerView('assign-once-stage', assignOnceStageView);
  registerFacets([assignOnceFacet]);
}
