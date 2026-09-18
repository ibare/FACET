import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { throughputNotLatency } from './algorithm.js';
import type { ThroughputNotLatencyFacetData } from './algorithm.js';
import { throughputNotLatencyScene } from './scene.js';
import { throughputNotLatencyIRs } from './irs.js';
import { throughputNotLatencyStageView } from './throughput-not-latency-stage.js';
import { throughputNotLatencyFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './throughput-not-latency-stage.js';
export * from './facet.js';

export function registerThroughputNotLatency(): void {
  registerAlgorithm<ThroughputNotLatencyFacetData>('throughputNotLatency', throughputNotLatency, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('throughputNotLatencyScene', throughputNotLatencyScene);
  for (const ir of throughputNotLatencyIRs) registerIR(ir.id, ir);
  registerView('throughput-not-latency-stage', throughputNotLatencyStageView);
  registerFacets([throughputNotLatencyFacet]);
}
