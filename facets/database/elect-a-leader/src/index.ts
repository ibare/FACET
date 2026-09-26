import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { electALeader, type ElectALeaderFacetData } from './algorithm.js';
import { electALeaderScene } from './scene.js';
import { electALeaderIRs } from './irs.js';
import { electALeaderStageView } from './elect-a-leader-stage.js';
import { electALeaderFacet } from './facet.js';

export { electALeader, majorityOf, type ElectALeaderFacetData, type ElectNode } from './algorithm.js';
export {
  electALeaderScene,
  type ElectScene,
  type ElectStep,
  type ElectNodeState,
  type ElectRole,
  type Refill,
} from './scene.js';
export { electALeaderIRs } from './irs.js';
export { electALeaderStageView } from './elect-a-leader-stage.js';
export { electALeaderFacet } from './facet.js';

export function registerElectALeader(): void {
  registerAlgorithm<ElectALeaderFacetData>('electALeader', electALeader, { mechanismKind: 'reactive' });
  registerScenePlan('electALeaderScene', electALeaderScene);
  for (const ir of electALeaderIRs) registerIR(ir.id, ir);
  registerView('elect-a-leader-stage', electALeaderStageView);
  registerFacets([electALeaderFacet]);
}
