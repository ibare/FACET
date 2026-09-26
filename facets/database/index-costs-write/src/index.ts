import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { indexCostsWrite, type IndexCostsWriteFacetData } from './algorithm.js';
import { indexCostsWriteScene } from './scene.js';
import { indexCostsWriteStageView } from './index-costs-write-stage.js';
import { indexCostsWriteIRs } from './irs.js';
import { indexCostsWriteFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './index-costs-write-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerIndexCostsWrite(): void {
  registerAlgorithm<IndexCostsWriteFacetData>('indexCostsWrite', indexCostsWrite, { mechanismKind: 'reactive' });
  registerScenePlan('indexCostsWriteScene', indexCostsWriteScene);
  for (const ir of indexCostsWriteIRs) registerIR(ir.id, ir);
  registerView('index-costs-write-stage', indexCostsWriteStageView);
  registerFacets([indexCostsWriteFacet]);
}
