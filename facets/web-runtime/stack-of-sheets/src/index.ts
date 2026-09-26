import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { stackOfSheets, type StackOfSheetsFacetData } from './algorithm.js';
import { stackOfSheetsScene } from './scene.js';
import { stackOfSheetsStageView } from './stack-of-sheets-stage.js';
import { stackOfSheetsIRs } from './irs.js';
import { stackOfSheetsFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { stackOfSheetsStageView } from './stack-of-sheets-stage.js';
export { stackOfSheetsIRs } from './irs.js';
export { stackOfSheetsFacet } from './facet.js';

export function registerStackOfSheets(): void {
  registerAlgorithm<StackOfSheetsFacetData>('stackOfSheets', stackOfSheets, { mechanismKind: 'reactive' });
  registerScenePlan('stackOfSheetsScene', stackOfSheetsScene);
  for (const ir of stackOfSheetsIRs) registerIR(ir.id, ir);
  registerView('stack-of-sheets-stage', stackOfSheetsStageView);
  registerFacets([stackOfSheetsFacet]);
}
