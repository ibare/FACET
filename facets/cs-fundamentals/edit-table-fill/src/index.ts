import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { editTableFillAlgorithm, type EditTableFillData } from './algorithm.js';
import { editTableFillScene } from './scene.js';
import { editTableFillIRs } from './irs.js';
import { editTableFillStageView } from './edit-table-fill-stage.js';
import { editTableFillFacet } from './facet.js';
import { editTableFillDescription } from './description.js';

export function registerEditTableFill(): void {
  registerAlgorithm<EditTableFillData>('editTableFill', editTableFillAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('editTableFillScene', editTableFillScene);
  for (const ir of editTableFillIRs) registerIR(ir.id, ir);
  registerView('edit-table-fill-stage', editTableFillStageView);
  registerFacets([editTableFillFacet]);
  registerDescription(editTableFillFacet.id, editTableFillDescription);
}

export {
  editTableFillAlgorithm,
  buildEditWaves,
  editLetterMatch,
  editStepCost,
  editTableCols,
  editTableDiagonal,
  editTableRows,
  editWaveCount,
} from './algorithm.js';
export type { EditTableFillData, EditCellFrom, EditFill, EditWave } from './algorithm.js';
export { editTableFillScene } from './scene.js';
export type { EditStep, EditTableFillScene } from './scene.js';
export { editTableFillIRs } from './irs.js';
export { editTableFillStageView } from './edit-table-fill-stage.js';
export { editTableFillFacet } from './facet.js';
export { editTableFillDescription } from './description.js';
