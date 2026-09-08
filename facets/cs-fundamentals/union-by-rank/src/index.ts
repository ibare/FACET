/**
 * @ffacet/algorithm-union-by-rank — 랭크 기반 합집합 조각(piece) 번들.
 *
 * "고르기만 잘해도 나무가 길어지지 않는다" 는 장면 하나. algorithm / projector /
 * stage view / facet JSON / description 을 함께 묶고 등록 헬퍼를 제공한다.
 * 등록 호출 책임은 호스트 앱에 있다 (여기서 사이드 이펙트로 부르지 않는다).
 */

export { unionByRankAlgorithm, type UnionByRankData } from './algorithm.js';
export { unionByRankProjector } from './projector.js';
export { unionByRankIRs } from './irs.js';
export { unionByRankStageView } from './union-by-rank-stage.js';
export { unionByRankFacet } from './facet.js';
export { unionByRankDescription } from './description.js';

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { unionByRankAlgorithm, type UnionByRankData } from './algorithm.js';
import { unionByRankProjector } from './projector.js';
import { unionByRankIRs } from './irs.js';
import { unionByRankStageView } from './union-by-rank-stage.js';
import { unionByRankFacet } from './facet.js';
import { unionByRankDescription } from './description.js';

export function registerUnionByRank(): void {
  // 조각은 스스로 재생하고 걸음 간격도 스스로 정한다 → reactive (S-piece).
  registerAlgorithm<UnionByRankData>('unionByRank', unionByRankAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('unionByRankProjector', unionByRankProjector);
  for (const ir of unionByRankIRs) registerIR(ir.id, ir);
  registerView('union-by-rank-stage', unionByRankStageView);
  registerFacets([unionByRankFacet]);
  registerDescription(unionByRankFacet.id, unionByRankDescription);
}
