/**
 * vectorSimilarity facet 등록 진입점.
 *
 * 호출 책임은 호스트 앱에 있다 — 이 모듈은 import 만으로 등록하지 않는다 (S-facet).
 */

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';

import { vectorSimilarityAlgorithm } from './algorithm.js';
import { vectorSimilarityProjector } from './projector.js';
import { vectorSimilarityIRs } from './irs.js';
import { vectorSimilarityStageView } from './vector-similarity-stage.js';
import { vectorSimilarityFacet } from './facet.js';
import { vectorSimilarityDescription } from './description.js';

export function registerVectorSimilarity(): void {
  // 손잡이가 붙은 완제품은 reactive 다. `CoroutineMechanism.supportedControls` 에
  // `'*'` 가 없어 `metric` 액션이 마운트 시점에 throw 하고, 통과하더라도 그쪽
  // `dispatch` 는 no-op 이라 손잡이가 알고리즘에 닿지 않는다.
  registerAlgorithm('vectorSimilarity', vectorSimilarityAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('vectorSimilarityProjector', vectorSimilarityProjector);
  for (const ir of vectorSimilarityIRs) registerIR(ir.id, ir);
  registerView('vector-similarity-stage', vectorSimilarityStageView);
  registerFacets([vectorSimilarityFacet]);
  registerDescription(vectorSimilarityFacet.id, vectorSimilarityDescription);
}

export { vectorSimilarityAlgorithm, VECTOR_SIMILARITY_MEASURES, measureValue, rankOrder } from './algorithm.js';
export type { VectorSimilarityData, VectorPoint, MeasureKind } from './algorithm.js';
export { vectorSimilarityProjector } from './projector.js';
export { vectorSimilarityIRs } from './irs.js';
export { vectorSimilarityStageView } from './vector-similarity-stage.js';
export { vectorSimilarityFacet } from './facet.js';
export { vectorSimilarityDescription } from './description.js';
