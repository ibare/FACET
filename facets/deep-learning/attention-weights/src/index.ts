import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { attentionWeights, type AttentionWeightsFacetData } from './algorithm.js';
import { attentionWeightsScene } from './scene.js';
import { attentionWeightsStageView } from './attention-weights-stage.js';
import { attentionWeightsIRs } from './irs.js';
import { attentionWeightsFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './attention-weights-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerAttentionWeights(): void {
  registerAlgorithm<AttentionWeightsFacetData>('attentionWeights', attentionWeights, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('attentionWeightsScene', attentionWeightsScene);
  for (const ir of attentionWeightsIRs) registerIR(ir.id, ir);
  registerView('attention-weights-stage', attentionWeightsStageView);
  registerFacets([attentionWeightsFacet]);
}
