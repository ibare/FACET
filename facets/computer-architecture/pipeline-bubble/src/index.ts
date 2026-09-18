import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { pipelineBubble, type PipelineBubbleFacetData } from './algorithm.js';
import { pipelineBubbleFacet } from './facet.js';
import { pipelineBubbleIRs } from './irs.js';
import { pipelineBubbleScene } from './scene.js';
import { pipelineBubbleStageView } from './pipeline-bubble-stage.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './pipeline-bubble-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerPipelineBubble(): void {
  registerAlgorithm<PipelineBubbleFacetData>('pipelineBubble', pipelineBubble, { mechanismKind: 'reactive' });
  registerScenePlan('pipelineBubbleScene', pipelineBubbleScene);
  for (const ir of pipelineBubbleIRs) registerIR(ir.id, ir);
  registerView('pipeline-bubble-stage', pipelineBubbleStageView);
  registerFacets([pipelineBubbleFacet]);
}
