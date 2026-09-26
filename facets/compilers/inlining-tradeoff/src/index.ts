import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { inliningTradeoffAlgorithm, type InliningTradeoffData } from './algorithm.js';
import { inliningTradeoffProjector } from './projector.js';
import { inliningTradeoffIRs } from './irs.js';
import { inliningTradeoffStageView } from './inlining-tradeoff-stage.js';
import { inliningTradeoffFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './inlining-tradeoff-stage.js';
export * from './facet.js';

export function registerInliningTradeoff(): void {
  registerAlgorithm<InliningTradeoffData>('inliningTradeoff', inliningTradeoffAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('inliningTradeoffProjector', inliningTradeoffProjector);
  for (const ir of inliningTradeoffIRs) registerIR(ir.id, ir);
  registerView('inlining-tradeoff-stage', inliningTradeoffStageView);
  registerFacets([inliningTradeoffFacet]);
}
