import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { readyFirst, type ReadyFirstFacetData } from './algorithm.js';
import { readyFirstScene } from './scene.js';
import { readyFirstStageView } from './ready-first-stage.js';
import { readyFirstIRs } from './irs.js';
import { readyFirstFacet } from './facet.js';

export { readyFirst, type ReadyFirstFacetData, type ReadyFirstInstr } from './algorithm.js';
export {
  readyFirstScene,
  type ReadyFirstScene,
  type ReadyFirstSceneInstr,
  type ReadyFirstStep,
} from './scene.js';
export { readyFirstStageView } from './ready-first-stage.js';
export { readyFirstIRs } from './irs.js';
export { readyFirstFacet } from './facet.js';

export function registerReadyFirst(): void {
  registerAlgorithm<ReadyFirstFacetData>('readyFirst', readyFirst, { mechanismKind: 'reactive' });
  registerScenePlan('readyFirstScene', readyFirstScene);
  for (const ir of readyFirstIRs) registerIR(ir.id, ir);
  registerView('ready-first-stage', readyFirstStageView);
  registerFacets([readyFirstFacet]);
}
