/**
 * @ffacet/algorithm-average-the-buckets — 나눠 재고 평균 내는 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 여섯 걸음을 자동 재생하고 멈추며, 다시 보기와 재생
 * 자리를 끄는 띠 외에는 조작을 받지 않는다.
 *
 * 화면은 명령이 아니라 **장면**으로 만든다 — `scene.ts` 가 이벤트를 상태로 옮기고
 * stage 의 `render` 가 그 상태에서 화면을 세운다 (S-scene).
 *
 * 등록은 호스트가 부른다 — 이 파일은 사이드 이펙트로 스스로 등록하지 않는다.
 */

export {
  averageTheBucketsAlgorithm,
  type AverageTheBucketsData,
  type AverageTheBucketsKey,
} from './algorithm.js';
export { averageTheBucketsScene, type AverageTheBucketsScene } from './scene.js';
export { averageTheBucketsIRs } from './irs.js';
export { averageTheBucketsFacet } from './facet.js';
export { averageTheBucketsStageView } from './average-the-buckets-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';

import { averageTheBucketsAlgorithm, type AverageTheBucketsData } from './algorithm.js';
import { averageTheBucketsScene } from './scene.js';
import { averageTheBucketsIRs } from './irs.js';
import { averageTheBucketsFacet } from './facet.js';
import { averageTheBucketsStageView } from './average-the-buckets-stage.js';

export function registerAverageTheBuckets(): void {
  registerAlgorithm<AverageTheBucketsData>('averageTheBuckets', averageTheBucketsAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('averageTheBucketsScene', averageTheBucketsScene);
  for (const ir of averageTheBucketsIRs) registerIR(ir.id, ir);
  registerView('average-the-buckets-stage', averageTheBucketsStageView);
  registerFacets([averageTheBucketsFacet]);
}
