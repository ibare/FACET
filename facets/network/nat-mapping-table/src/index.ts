import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { natMappingTable, type NatMappingTableFacetData } from './algorithm.js';
import { natMappingTableScene } from './scene.js';
import { natMappingTableStageView } from './nat-mapping-table-stage.js';
import { natMappingTableIRs } from './irs.js';
import { natMappingTableFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './nat-mapping-table-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerNatMappingTable(): void {
  registerAlgorithm<NatMappingTableFacetData>('natMappingTable', natMappingTable, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('natMappingTableScene', natMappingTableScene);
  for (const ir of natMappingTableIRs) registerIR(ir.id, ir);
  registerView('nat-mapping-table-stage', natMappingTableStageView);
  registerFacets([natMappingTableFacet]);
}
