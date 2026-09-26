export * from './algorithm.js';
export * from './scene.js';
export * from './one-turn-at-a-time-stage.js';
export * from './irs.js';
export * from './facet.js';

import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { oneTurnAtATime } from './algorithm.js';
import { oneTurnAtATimeFacet } from './facet.js';
import { oneTurnAtATimeIRs } from './irs.js';
import { oneTurnAtATimeScene } from './scene.js';
import { oneTurnAtATimeStageView } from './one-turn-at-a-time-stage.js';

/** 등록 진입점 — 호출은 호스트의 몫이다. */
export function registerOneTurnAtATime(): void {
  registerAlgorithm('oneTurnAtATime', oneTurnAtATime, { mechanismKind: 'reactive' });
  registerScenePlan('oneTurnAtATimeScene', oneTurnAtATimeScene);
  for (const ir of oneTurnAtATimeIRs) registerIR(ir.id, ir);
  registerView('one-turn-at-a-time-stage', oneTurnAtATimeStageView);
  registerFacets([oneTurnAtATimeFacet]);
}
