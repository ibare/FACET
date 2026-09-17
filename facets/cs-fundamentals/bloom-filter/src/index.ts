/**
 * @ffacet/algorithm-bloom-filter — 등록 진입점.
 *
 * 등록은 호스트 앱의 책임이다. 이 모듈은 사이드 이펙트로 스스로 등록하지 않는다.
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { bloomFilterAlgorithm, type BloomFilterData } from './algorithm.js';
import { bloomFilterProjector } from './projector.js';
import { bloomFilterIRs } from './irs.js';
import { bloomFilterStageView } from './bloom-filter-stage.js';
import { bloomFilterFacet } from './facet.js';

export {
  bloomFilterAlgorithm,
  bloomFilterProjector,
  bloomFilterIRs,
  bloomFilterStageView,
  bloomFilterFacet,
};
export { bloomSlots, bloomQueryKey, BLOOM_SLOT_CHOICES, BLOOM_HASH_CHOICES } from './algorithm.js';
export { bloomFilterImperativeIR } from './irs.js';
export type { BloomFilterData, BloomFilterHash } from './algorithm.js';

export function registerBloomFilter(): void {
  // 손잡이가 있는 완제품은 reactive 다 — 독자가 미는 것이 곧 다음 판이다.
  registerAlgorithm<BloomFilterData>('bloomFilter', bloomFilterAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('bloomFilterProjector', bloomFilterProjector);
  for (const ir of bloomFilterIRs) registerIR(ir.id, ir);
  registerView('bloom-filter-stage', bloomFilterStageView);
  registerFacets([bloomFilterFacet]);
}
