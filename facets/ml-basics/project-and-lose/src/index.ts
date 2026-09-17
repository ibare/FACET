/**
 * projectAndLose 등록 진입점. 호출은 호스트 앱이 한다 (S-facet).
 *
 * 화면은 장면(Scene) 으로 만든다. projector 대신 `ScenePlan` 을 등록하고 stage 가
 * 그것을 그린다 (S-scene).
 */
import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import {
  projectAndLoseAlgorithm,
  projectOnAxis,
  PROJECT_WAVE,
  type ProjectAndLoseData,
  type Projection,
  type ProjectionShot,
} from './algorithm.js';
import { projectAndLoseDescription } from './description.js';
import { projectAndLoseFacet } from './facet.js';
import { projectAndLoseIRs } from './irs.js';
import {
  droppedOf,
  phaseOf,
  projectAndLoseScene,
  projectionOf,
  waveAt,
  type ProjectAndLosePhase,
  type ProjectAndLoseScene,
  type ProjectAndLoseStep,
  type ScenePoint,
} from './scene.js';
import { projectAndLoseStageView } from './project-and-lose-stage.js';

export { projectAndLoseAlgorithm, projectAndLoseDescription, projectAndLoseFacet };
export { projectAndLoseIRs, projectAndLoseStageView };
export { projectAndLoseScene, projectionOf, droppedOf, waveAt, phaseOf };
export { projectOnAxis, PROJECT_WAVE };
export type { ProjectAndLoseData, Projection, ProjectionShot };
export type { ProjectAndLoseScene, ProjectAndLoseStep, ProjectAndLosePhase, ScenePoint };

export function registerProjectAndLose(): void {
  registerAlgorithm<ProjectAndLoseData>('projectAndLose', projectAndLoseAlgorithm, {
    mechanismKind: 'reactive',
  });
  // 장면 이름은 algorithm 과 겹치지 않는다 — `module:` 참조가 어느 쪽인지
  // 말하지 못하게 된다 (C4, packages/core/test/register-names.test.ts).
  registerScenePlan('projectAndLoseScene', projectAndLoseScene);
  for (const ir of projectAndLoseIRs) registerIR(ir.id, ir);
  registerView('project-and-lose-stage', projectAndLoseStageView);
  registerFacets([projectAndLoseFacet]);
  registerDescription(projectAndLoseFacet.id, projectAndLoseDescription);
}
