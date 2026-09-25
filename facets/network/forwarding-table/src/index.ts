import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { forwardingTable, type ForwardingTableFacetData } from './algorithm.js';
import { forwardingTableScene } from './scene.js';
import { forwardingTableStageView } from './forwarding-table-stage.js';
import { forwardingTableIRs } from './irs.js';
import { forwardingTableFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './forwarding-table-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerForwardingTable(): void {
  registerAlgorithm<ForwardingTableFacetData>('forwardingTable', forwardingTable, { mechanismKind: 'reactive' });
  registerScenePlan('forwardingTableScene', forwardingTableScene);
  for (const ir of forwardingTableIRs) registerIR(ir.id, ir);
  registerView('forwarding-table-stage', forwardingTableStageView);
  registerFacets([forwardingTableFacet]);
}
