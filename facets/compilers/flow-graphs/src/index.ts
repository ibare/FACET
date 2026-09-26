import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { flowGraphsAlgorithm, type FlowGraphsData } from './algorithm.js';
import { flowGraphsFacet } from './facet.js';
import { flowGraphsStageView } from './flow-graphs-stage.js';
import { flowGraphsIRs } from './irs.js';
import { flowGraphsProjector } from './projector.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './flow-graphs-stage.js';
export * from './facet.js';

export function registerFlowGraphs(): void {
  registerAlgorithm<FlowGraphsData>('flowGraphs', flowGraphsAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('flowGraphsProjector', flowGraphsProjector);
  for (const ir of flowGraphsIRs) registerIR(ir.id, ir);
  registerView('flow-graphs-stage', flowGraphsStageView);
  registerFacets([flowGraphsFacet]);
}
