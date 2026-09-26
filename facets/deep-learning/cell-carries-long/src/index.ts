import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { cellCarriesLong, type CellCarriesLongFacetData } from './algorithm';
import { cellCarriesLongScene } from './scene';
import { cellCarriesLongIRs } from './irs';
import { cellCarriesLongStageView } from './cell-carries-long-stage';
import { cellCarriesLongFacet } from './facet';

export * from './algorithm';
export * from './scene';
export * from './irs';
export * from './cell-carries-long-stage';
export * from './facet';

export function registerCellCarriesLong(): void {
  registerAlgorithm<CellCarriesLongFacetData>('cellCarriesLong', cellCarriesLong, { mechanismKind: 'reactive' });
  registerScenePlan('cellCarriesLongScene', cellCarriesLongScene);
  for (const ir of cellCarriesLongIRs) registerIR(ir.id, ir);
  registerView('cell-carries-long-stage', cellCarriesLongStageView);
  registerFacets([cellCarriesLongFacet]);
}
