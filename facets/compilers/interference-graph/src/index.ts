import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { interferenceGraph, type InterferenceGraphFacetData } from './algorithm.js';
import { interferenceGraphScene } from './scene.js';
import { interferenceGraphStageView } from './interference-graph-stage.js';
import { interferenceGraphIRs } from './irs.js';
import { interferenceGraphFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './interference-graph-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerInterferenceGraph(): void {
  registerAlgorithm<InterferenceGraphFacetData>('interferenceGraph', interferenceGraph, { mechanismKind: 'reactive' });
  registerScenePlan('interferenceGraphScene', interferenceGraphScene);
  for (const ir of interferenceGraphIRs) registerIR(ir.id, ir);
  registerView('interference-graph-stage', interferenceGraphStageView);
  registerFacets([interferenceGraphFacet]);
}
