import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { replayAfterCrash, type ReplayAfterCrashFacetData } from './algorithm.js';
import { replayAfterCrashScene } from './scene.js';
import { replayAfterCrashIRs } from './irs.js';
import { replayAfterCrashStageView } from './replay-after-crash-stage.js';
import { replayAfterCrashFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './replay-after-crash-stage.js';
export * from './facet.js';

export function registerReplayAfterCrash(): void {
  registerAlgorithm<ReplayAfterCrashFacetData>('replayAfterCrash', replayAfterCrash, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('replayAfterCrashScene', replayAfterCrashScene);
  for (const ir of replayAfterCrashIRs) registerIR(ir.id, ir);
  registerView('replay-after-crash-stage', replayAfterCrashStageView);
  registerFacets([replayAfterCrashFacet]);
}
