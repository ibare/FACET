import { registerAlgorithm, registerScenePlan, registerIR, registerView, registerFacets } from '@ffacet/core/runtime';
import { dirtyScan } from './algorithm.js';
import { dirtyScanScene } from './scene.js';
import { dirtyScanIRs } from './irs.js';
import { dirtyScanStageView } from './dirty-scan-stage.js';
import { dirtyScanFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './dirty-scan-stage.js';
export * from './facet.js';

/** 호스트가 부른다 — index.ts 는 스스로 부르지 않는다. */
export function registerDirtyScan(): void {
  registerAlgorithm('dirtyScan', dirtyScan, { mechanismKind: 'reactive' });
  registerScenePlan('dirtyScanScene', dirtyScanScene);
  for (const ir of dirtyScanIRs) registerIR(ir.id, ir);
  registerView('dirty-scan-stage', dirtyScanStageView);
  registerFacets([dirtyScanFacet]);
}
