/**
 * @ffacet/algorithm-chaining-bucket — 체이닝 조각(piece) facet 번들.
 *
 * 한 주장만 말하고 멈춘다. 열 걸음을 자동 재생한 뒤, 다시 보기와 띠 외에는 조작을
 * 받지 않는다. 화면은 명령이 아니라 장면에서 만들어진다 (S-scene). 등록은 호스트가
 * 부른다 (index 는 스스로 등록하지 않는다).
 */

export {
  chainingBucket,
  type ChainingBucketData,
  type ChainingEntry,
} from './algorithm.js';
export { chainingBucketScene, type ChainingBucketScene } from './scene.js';
export { chainingBucketIRs } from './irs.js';
export { chainingBucketFacet } from './facet.js';
export { chainingBucketDescription } from './description.js';
export { chainingBucketStageView } from './chaining-bucket-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { chainingBucket, type ChainingBucketData } from './algorithm.js';
import { chainingBucketScene } from './scene.js';
import { chainingBucketIRs } from './irs.js';
import { chainingBucketFacet } from './facet.js';
import { chainingBucketDescription } from './description.js';
import { chainingBucketStageView } from './chaining-bucket-stage.js';

export function registerChainingBucket(): void {
  registerAlgorithm<ChainingBucketData>('chainingBucket', chainingBucket, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('chainingBucketScene', chainingBucketScene);
  for (const ir of chainingBucketIRs) registerIR(ir.id, ir);
  registerView('chaining-bucket-stage', chainingBucketStageView);
  registerFacets([chainingBucketFacet]);
  registerDescription(chainingBucketFacet.id, chainingBucketDescription);
}
