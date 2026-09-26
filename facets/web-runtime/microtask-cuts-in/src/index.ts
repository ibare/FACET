/**
 * microtask-cuts-in — 등록 진입점.
 *
 * `registerMicrotaskCutsIn()` 을 이 모듈이 스스로 부르지 않는다 — 호출은 호스트 몫이다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './facet.js';

import { microtaskCutsIn } from './algorithm.js';
import { microtaskCutsInScene } from './scene.js';
import { microtaskCutsInStageView } from './microtask-cuts-in-stage.js';
import { microtaskCutsInIRs } from './irs.js';
import { microtaskCutsInFacet } from './facet.js';

export { microtaskCutsInStageView } from './microtask-cuts-in-stage.js';

export function registerMicrotaskCutsIn(): void {
  registerAlgorithm('microtaskCutsIn', microtaskCutsIn, { mechanismKind: 'reactive' });
  registerScenePlan('microtaskCutsInScene', microtaskCutsInScene);
  for (const ir of microtaskCutsInIRs) registerIR(ir.id, ir);
  registerView('microtask-cuts-in-stage', microtaskCutsInStageView);
  registerFacets([microtaskCutsInFacet]);
}
