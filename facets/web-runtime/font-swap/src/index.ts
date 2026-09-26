import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { fontSwap } from './algorithm.js';
import { fontSwapFacet } from './facet.js';
import { fontSwapStageView } from './font-swap-stage.js';
import { fontSwapIRs } from './irs.js';
import { fontSwapScene } from './scene.js';

export * from './algorithm.js';
export * from './facet.js';
export * from './font-swap-stage.js';
export * from './irs.js';
export * from './scene.js';

/** 등록 진입점 — 호출은 호스트의 몫이다. */
export function registerFontSwap(): void {
  registerAlgorithm('fontSwap', fontSwap, { mechanismKind: 'reactive' });
  registerScenePlan('fontSwapScene', fontSwapScene);
  for (const ir of fontSwapIRs) registerIR(ir.id, ir);
  registerView('font-swap-stage', fontSwapStageView);
  registerFacets([fontSwapFacet]);
}
