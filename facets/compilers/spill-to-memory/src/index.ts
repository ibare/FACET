import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { spillToMemory, type SpillToMemoryFacetData } from './algorithm.js';
import { spillToMemoryScene } from './scene.js';
import { spillToMemoryIRs } from './irs.js';
import { spillToMemoryStageView } from './spill-to-memory-stage.js';
import { spillToMemoryFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './spill-to-memory-stage.js';
export * from './facet.js';

export function registerSpillToMemory(): void {
  registerAlgorithm<SpillToMemoryFacetData>('spillToMemory', spillToMemory, { mechanismKind: 'reactive' });
  registerScenePlan('spillToMemoryScene', spillToMemoryScene);
  for (const ir of spillToMemoryIRs) registerIR(ir.id, ir);
  registerView('spill-to-memory-stage', spillToMemoryStageView);
  registerFacets([spillToMemoryFacet]);
}
