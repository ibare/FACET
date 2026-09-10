/**
 * projectAndLose 등록 진입점. 호출은 호스트 앱이 한다 (S-facet).
 */
import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { projectAndLoseAlgorithm, type ProjectAndLoseData } from './algorithm.js';
import { projectAndLoseDescription } from './description.js';
import { projectAndLoseFacet } from './facet.js';
import { projectAndLoseIRs } from './irs.js';
import { projectAndLoseProjector } from './projector.js';
import { projectAndLoseStageView } from './project-and-lose-stage.js';

export { projectAndLoseAlgorithm, projectAndLoseDescription, projectAndLoseFacet };
export { projectAndLoseIRs, projectAndLoseProjector, projectAndLoseStageView };
export type { ProjectAndLoseData };

export function registerProjectAndLose(): void {
  registerAlgorithm<ProjectAndLoseData>('projectAndLose', projectAndLoseAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('projectAndLoseProjector', projectAndLoseProjector);
  for (const ir of projectAndLoseIRs) registerIR(ir.id, ir);
  registerView('project-and-lose-stage', projectAndLoseStageView);
  registerFacets([projectAndLoseFacet]);
  registerDescription(projectAndLoseFacet.id, projectAndLoseDescription);
}
