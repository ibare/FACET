import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { branchHistoryTableAlgorithm } from './algorithm.js';
import { branchHistoryTableProjector } from './projector.js';
import { branchHistoryTableIRs } from './irs.js';
import { branchHistoryTableStageView } from './branch-history-table-stage.js';
import { branchHistoryTableFacet } from './facet.js';

export { branchHistoryTableAlgorithm, type BranchHistoryTableData } from './algorithm.js';
export { branchHistoryTableProjector } from './projector.js';
export { branchHistoryTableImperativeIR, branchHistoryTableIRs } from './irs.js';
export { branchHistoryTableStageView, type BranchHistoryTableStage } from './branch-history-table-stage.js';
export { branchHistoryTableFacet } from './facet.js';

export function registerBranchHistoryTable(): void {
  registerAlgorithm('branchHistoryTable', branchHistoryTableAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('branchHistoryTableProjector', branchHistoryTableProjector);
  for (const ir of branchHistoryTableIRs) registerIR(ir.id, ir);
  registerView('branch-history-table-stage', branchHistoryTableStageView);
  registerFacets([branchHistoryTableFacet]);
}
