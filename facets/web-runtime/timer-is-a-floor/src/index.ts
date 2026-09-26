import { registerAlgorithm, registerScenePlan, registerIR, registerView, registerFacets } from '@ffacet/core/runtime';
import { timerIsAFloor } from './algorithm.js';
import { timerIsAFloorScene } from './scene.js';
import { timerIsAFloorIRs } from './irs.js';
import { timerIsAFloorStageView } from './timer-is-a-floor-stage.js';
import { timerIsAFloorFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './facet.js';
export * from './timer-is-a-floor-stage.js';

/** 호스트가 부른다 — index.ts 는 스스로 부르지 않는다. */
export function registerTimerIsAFloor(): void {
  registerAlgorithm('timerIsAFloor', timerIsAFloor, { mechanismKind: 'reactive' });
  registerScenePlan('timerIsAFloorScene', timerIsAFloorScene);
  for (const ir of timerIsAFloorIRs) registerIR(ir.id, ir);
  registerView('timer-is-a-floor-stage', timerIsAFloorStageView);
  registerFacets([timerIsAFloorFacet]);
}
