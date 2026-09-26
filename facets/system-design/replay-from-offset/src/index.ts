import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { replayFromOffset, type ReplayFromOffsetFacetData } from './algorithm.js';
import { replayFromOffsetScene } from './scene.js';
import { replayFromOffsetStageView } from './replay-from-offset-stage.js';
import { replayFromOffsetIRs } from './irs.js';
import { replayFromOffsetFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './replay-from-offset-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerReplayFromOffset(): void {
  registerAlgorithm<ReplayFromOffsetFacetData>('replayFromOffset', replayFromOffset, { mechanismKind: 'reactive' });
  registerScenePlan('replayFromOffsetScene', replayFromOffsetScene);
  for (const ir of replayFromOffsetIRs) registerIR(ir.id, ir);
  registerView('replay-from-offset-stage', replayFromOffsetStageView);
  registerFacets([replayFromOffsetFacet]);
}
