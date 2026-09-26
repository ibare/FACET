import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { replayOnNewBase, type ReplayOnNewBaseFacetData } from './algorithm.js';
import { replayOnNewBaseScene } from './scene.js';
import { replayOnNewBaseIRs } from './irs.js';
import { replayOnNewBaseStageView } from './replay-on-new-base-stage.js';
import { replayOnNewBaseFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './replay-on-new-base-stage.js';
export * from './facet.js';

export function registerReplayOnNewBase(): void {
  registerAlgorithm<ReplayOnNewBaseFacetData>('replayOnNewBase', replayOnNewBase, { mechanismKind: 'reactive' });
  registerScenePlan('replayOnNewBaseScene', replayOnNewBaseScene);
  for (const ir of replayOnNewBaseIRs) registerIR(ir.id, ir);
  registerView('replay-on-new-base-stage', replayOnNewBaseStageView);
  registerFacets([replayOnNewBaseFacet]);
}
