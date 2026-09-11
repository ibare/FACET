/**
 * @ffacet/algorithm-average-the-buckets — 나눠 재고 평균 내는 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 여섯 걸음을 자동 재생하고 멈추며, 다시 보기와
 * 한 걸음씩 짚어 보는 단추 외에는 조작을 받지 않는다.
 *
 * 등록은 호스트가 부른다 — 이 파일은 사이드 이펙트로 스스로 등록하지 않는다.
 */

export {
  averageTheBucketsAlgorithm,
  type AverageTheBucketsData,
  type AverageTheBucketsKey,
} from './algorithm.js';
export { averageTheBucketsProjector } from './projector.js';
export { averageTheBucketsIRs } from './irs.js';
export { averageTheBucketsFacet } from './facet.js';
export { averageTheBucketsDescription } from './description.js';
export { averageTheBucketsStageView } from './average-the-buckets-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';

import { averageTheBucketsAlgorithm, type AverageTheBucketsData } from './algorithm.js';
import { averageTheBucketsProjector } from './projector.js';
import { averageTheBucketsIRs } from './irs.js';
import { averageTheBucketsFacet } from './facet.js';
import { averageTheBucketsDescription } from './description.js';
import { averageTheBucketsStageView } from './average-the-buckets-stage.js';

export function registerAverageTheBuckets(): void {
  registerAlgorithm<AverageTheBucketsData>('averageTheBuckets', averageTheBucketsAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('averageTheBucketsProjector', averageTheBucketsProjector);
  for (const ir of averageTheBucketsIRs) registerIR(ir.id, ir);
  registerView('average-the-buckets-stage', averageTheBucketsStageView);
  registerFacets([averageTheBucketsFacet]);
  registerDescription(averageTheBucketsFacet.id, averageTheBucketsDescription);
}
