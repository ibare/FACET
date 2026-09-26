import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { pinWhatWasChosen, type PinWhatWasChosenFacetData } from './algorithm.js';
import { pinWhatWasChosenScene } from './scene.js';
import { pinWhatWasChosenStageView } from './pin-what-was-chosen-stage.js';
import { pinWhatWasChosenIRs } from './irs.js';
import { pinWhatWasChosenFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { pinWhatWasChosenStageView } from './pin-what-was-chosen-stage.js';
export { pinWhatWasChosenIRs } from './irs.js';
export { pinWhatWasChosenFacet } from './facet.js';

/** 이 조각을 레지스트리에 올린다. 호출은 호스트 몫이다. */
export function registerPinWhatWasChosen(): void {
  registerAlgorithm<PinWhatWasChosenFacetData>('pinWhatWasChosen', pinWhatWasChosen, { mechanismKind: 'reactive' });
  registerScenePlan('pinWhatWasChosenScene', pinWhatWasChosenScene);
  for (const ir of pinWhatWasChosenIRs) registerIR(ir.id, ir);
  registerView('pin-what-was-chosen-stage', pinWhatWasChosenStageView);
  registerFacets([pinWhatWasChosenFacet]);
}
