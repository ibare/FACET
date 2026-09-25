import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { saveAndRestore, type SaveAndRestoreFacetData } from './algorithm.js';
import { saveAndRestoreScene } from './scene.js';
import { saveAndRestoreIRs } from './irs.js';
import { saveAndRestoreStageView } from './save-and-restore-stage.js';
import { saveAndRestoreFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './save-and-restore-stage.js';
export * from './facet.js';

export function registerSaveAndRestore(): void {
  registerAlgorithm<SaveAndRestoreFacetData>('saveAndRestore', saveAndRestore, { mechanismKind: 'reactive' });
  registerScenePlan('saveAndRestoreScene', saveAndRestoreScene);
  for (const ir of saveAndRestoreIRs) registerIR(ir.id, ir);
  registerView('save-and-restore-stage', saveAndRestoreStageView);
  registerFacets([saveAndRestoreFacet]);
}
