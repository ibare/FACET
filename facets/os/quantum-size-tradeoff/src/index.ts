import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { quantumSizeTradeoff, type QuantumSizeTradeoffFacetData } from './algorithm.js';
import { quantumSizeTradeoffScene } from './scene.js';
import { quantumSizeTradeoffIRs } from './irs.js';
import { quantumSizeTradeoffStageView } from './quantum-size-tradeoff-stage.js';
import { quantumSizeTradeoffFacet } from './facet.js';

export { quantumSizeTradeoff, type QuantumSizeTradeoffFacetData } from './algorithm.js';
export { quantumSizeTradeoffScene, type QuantumSizeTradeoffScene } from './scene.js';
export { quantumSizeTradeoffIRs } from './irs.js';
export { quantumSizeTradeoffStageView } from './quantum-size-tradeoff-stage.js';
export { quantumSizeTradeoffFacet } from './facet.js';

export function registerQuantumSizeTradeoff(): void {
  registerAlgorithm<QuantumSizeTradeoffFacetData>('quantumSizeTradeoff', quantumSizeTradeoff, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('quantumSizeTradeoffScene', quantumSizeTradeoffScene);
  for (const ir of quantumSizeTradeoffIRs) registerIR(ir.id, ir);
  registerView('quantum-size-tradeoff-stage', quantumSizeTradeoffStageView);
  registerFacets([quantumSizeTradeoffFacet]);
}
