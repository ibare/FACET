/**
 * self-attention — 같은 투영 행렬을 머리 하나로 읽나, 열을 나눠 머리 둘로 읽나.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { selfAttentionAlgorithm, type SelfAttentionData } from './algorithm.js';
import { selfAttentionProjector } from './projector.js';
import { selfAttentionIRs } from './irs.js';
import { selfAttentionStageView } from './self-attention-stage.js';
import { selfAttentionFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './self-attention-stage.js';
export * from './facet.js';

export function registerSelfAttention(): void {
  registerAlgorithm<SelfAttentionData>('selfAttention', selfAttentionAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('selfAttentionProjector', selfAttentionProjector);
  for (const ir of selfAttentionIRs) registerIR(ir.id, ir);
  registerView('self-attention-stage', selfAttentionStageView);
  registerFacets([selfAttentionFacet]);
}
