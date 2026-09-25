import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { tracingVsRefcountAlgorithm, type TracingVsRefcountData } from './algorithm.js';
import { tracingVsRefcountProjector } from './projector.js';
import { tracingVsRefcountIRs } from './irs.js';
import { tracingVsRefcountStageView } from './tracing-vs-refcount-stage.js';
import { tracingVsRefcountFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './tracing-vs-refcount-stage.js';
export * from './facet.js';

export function registerTracingVsRefcount(): void {
  registerAlgorithm<TracingVsRefcountData>('tracingVsRefcount', tracingVsRefcountAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('tracingVsRefcountProjector', tracingVsRefcountProjector);
  for (const ir of tracingVsRefcountIRs) registerIR(ir.id, ir);
  registerView('tracing-vs-refcount-stage', tracingVsRefcountStageView);
  registerFacets([tracingVsRefcountFacet]);
}
