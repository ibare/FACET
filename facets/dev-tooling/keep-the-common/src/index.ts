import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { keepTheCommon, type KeepTheCommonFacetData } from './algorithm.js';
import { keepTheCommonFacet } from './facet.js';
import { keepTheCommonIRs } from './irs.js';
import { keepTheCommonStageView } from './keep-the-common-stage.js';
import { keepTheCommonScene } from './scene.js';

export { keepTheCommon, walkDiff, editCount } from './algorithm.js';
export type { KeepTheCommonFacetData, DiffOp } from './algorithm.js';
export { keepTheCommonScene } from './scene.js';
export type { KeepTheCommonScene, KeepStep, KeepPair } from './scene.js';
export { keepTheCommonStageView } from './keep-the-common-stage.js';
export { keepTheCommonIRs } from './irs.js';
export { keepTheCommonFacet } from './facet.js';

export function registerKeepTheCommon(): void {
  registerAlgorithm<KeepTheCommonFacetData>('keepTheCommon', keepTheCommon, { mechanismKind: 'reactive' });
  registerScenePlan('keepTheCommonScene', keepTheCommonScene);
  for (const ir of keepTheCommonIRs) registerIR(ir.id, ir);
  registerView('keep-the-common-stage', keepTheCommonStageView);
  registerFacets([keepTheCommonFacet]);
}
