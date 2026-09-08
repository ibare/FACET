/**
 * hash-to-bucket 조각의 등록 진입점.
 *
 * 사이드 이펙트로 등록하지 않는다 — 호스트 앱이 `registerHashToBucket()` 을
 * 명시적으로 부른다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { hashToBucketAlgorithm, type HashToBucketData } from './algorithm.js';
import { hashToBucketProjector } from './projector.js';
import { hashToBucketIRs } from './irs.js';
import { hashToBucketStageView } from './hash-to-bucket-stage.js';
import { hashToBucketFacet } from './facet.js';
import { hashToBucketDescription } from './description.js';

export {
  hashToBucketAlgorithm,
  hashToBucketProjector,
  hashToBucketIRs,
  hashToBucketStageView,
  hashToBucketFacet,
  hashToBucketDescription,
};
export type { HashToBucketData };

export function registerHashToBucket(): void {
  registerAlgorithm<HashToBucketData>('hash-to-bucket', hashToBucketAlgorithm, {
    // 조각은 mount 되면 스스로 시작하고 걸음 간격을 스스로 정한다 (S-piece).
    mechanismKind: 'reactive',
  });
  registerProjector('hash-to-bucket', hashToBucketProjector);
  for (const ir of hashToBucketIRs) registerIR(ir.id, ir);
  registerView('hash-to-bucket-stage', hashToBucketStageView);
  registerFacets([hashToBucketFacet]);
  registerDescription(hashToBucketFacet.id, hashToBucketDescription);
}
