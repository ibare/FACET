import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { columnFamilyAlgorithm, type ColumnFamilyData } from './algorithm.js';
import { columnFamilyProjector } from './projector.js';
import { columnFamilyIRs } from './irs.js';
import { columnFamilyStageView } from './column-family-stage.js';
import { columnFamilyFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './column-family-stage.js';
export * from './facet.js';

export function registerColumnFamily(): void {
  registerAlgorithm<ColumnFamilyData>('columnFamily', columnFamilyAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('columnFamilyProjector', columnFamilyProjector);
  for (const ir of columnFamilyIRs) registerIR(ir.id, ir);
  registerView('column-family-stage', columnFamilyStageView);
  registerFacets([columnFamilyFacet]);
}
