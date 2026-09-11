import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { editTableFillAlgorithm, type EditTableFillData } from './algorithm.js';
import { editTableFillProjector } from './projector.js';
import { editTableFillIRs } from './irs.js';
import { editTableFillStageView } from './edit-table-fill-stage.js';
import { editTableFillFacet } from './facet.js';
import { editTableFillDescription } from './description.js';

export function registerEditTableFill(): void {
  registerAlgorithm<EditTableFillData>('editTableFill', editTableFillAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('editTableFillProjector', editTableFillProjector);
  for (const ir of editTableFillIRs) registerIR(ir.id, ir);
  registerView('edit-table-fill-stage', editTableFillStageView);
  registerFacets([editTableFillFacet]);
  registerDescription(editTableFillFacet.id, editTableFillDescription);
}

export { editTableFillAlgorithm, buildEditWaves } from './algorithm.js';
export type { EditTableFillData, EditCell, EditCellFrom, EditWave } from './algorithm.js';
export { editTableFillProjector } from './projector.js';
export { editTableFillIRs } from './irs.js';
export { editTableFillStageView } from './edit-table-fill-stage.js';
export { editTableFillFacet } from './facet.js';
export { editTableFillDescription } from './description.js';
