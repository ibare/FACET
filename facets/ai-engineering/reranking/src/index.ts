import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { rerankingAlgorithm, type RerankingData } from './algorithm.js';
import { rerankingProjector } from './projector.js';
import { rerankingIRs } from './irs.js';
import { rerankingStageView } from './reranking-stage.js';
import { rerankingFacet } from './facet.js';

export {
  rerankingAlgorithm,
  firstStageOrder,
  rerankOrder,
  movedCount,
  TOP_K,
  type RerankingData,
  type RerankingDoc,
} from './algorithm.js';
export { rerankingProjector } from './projector.js';
export { rerankingImperativeIR, rerankingIRs } from './irs.js';
export { rerankingStageView, type RerankingStage } from './reranking-stage.js';
export { rerankingFacet } from './facet.js';

/** 재순위 facet 을 등록한다. 부르는 것은 호스트 몫이다. */
export function registerReranking(): void {
  registerAlgorithm<RerankingData>('reranking', rerankingAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('rerankingProjector', rerankingProjector);
  for (const ir of rerankingIRs) registerIR(ir.id, ir);
  registerView('reranking-stage', rerankingStageView);
  registerFacets([rerankingFacet]);
}
