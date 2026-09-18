import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { dualIssue, type DualIssueFacetData } from './algorithm.js';
import { dualIssueScene } from './scene.js';
import { dualIssueIRs } from './irs.js';
import { dualIssueStageView } from './dual-issue-stage.js';
import { dualIssueFacet } from './facet.js';

export { dualIssue, type DualIssueFacetData, type DualIssueInstr } from './algorithm.js';
export {
  dualIssueScene,
  type DualIssueScene,
  type DualIssueSceneInstr,
  type DualIssueGate,
  type DualIssuePlaced,
  type DualIssueStep,
} from './scene.js';
export { dualIssueIRs } from './irs.js';
export { dualIssueStageView } from './dual-issue-stage.js';
export { dualIssueFacet } from './facet.js';

export function registerDualIssue(): void {
  registerAlgorithm<DualIssueFacetData>('dualIssue', dualIssue, { mechanismKind: 'reactive' });
  registerScenePlan('dualIssueScene', dualIssueScene);
  for (const ir of dualIssueIRs) registerIR(ir.id, ir);
  registerView('dual-issue-stage', dualIssueStageView);
  registerFacets([dualIssueFacet]);
}
