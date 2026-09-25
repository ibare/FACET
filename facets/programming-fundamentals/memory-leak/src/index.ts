import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { memoryLeak, type MemoryLeakFacetData } from './algorithm.js';
import { memoryLeakScene } from './scene.js';
import { memoryLeakStageView } from './memory-leak-stage.js';
import { memoryLeakIRs } from './irs.js';
import { memoryLeakFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './memory-leak-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerMemoryLeak(): void {
  registerAlgorithm<MemoryLeakFacetData>('memoryLeak', memoryLeak, { mechanismKind: 'reactive' });
  registerScenePlan('memoryLeakScene', memoryLeakScene);
  for (const ir of memoryLeakIRs) registerIR(ir.id, ir);
  registerView('memory-leak-stage', memoryLeakStageView);
  registerFacets([memoryLeakFacet]);
}
