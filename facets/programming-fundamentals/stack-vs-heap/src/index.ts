import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { stackVsHeap, type StackVsHeapFacetData } from './algorithm.js';
import { stackVsHeapScene } from './scene.js';
import { stackVsHeapStageView } from './stack-vs-heap-stage.js';
import { stackVsHeapIRs } from './irs.js';
import { stackVsHeapFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './stack-vs-heap-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerStackVsHeap(): void {
  registerAlgorithm<StackVsHeapFacetData>('stackVsHeap', stackVsHeap, { mechanismKind: 'reactive' });
  registerScenePlan('stackVsHeapScene', stackVsHeapScene);
  for (const ir of stackVsHeapIRs) registerIR(ir.id, ir);
  registerView('stack-vs-heap-stage', stackVsHeapStageView);
  registerFacets([stackVsHeapFacet]);
}
