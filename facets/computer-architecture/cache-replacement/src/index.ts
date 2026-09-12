/**
 * @ffacet/algorithm-cache-replacement — 캐시 교체 정책 완제품.
 *
 * 등록 책임은 호스트에 있다. 이 파일은 사이드 이펙트로 스스로 등록하지 않는다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { cacheReplacementAlgorithm, type CacheReplacementData } from './algorithm.js';
import { cacheReplacementProjector } from './projector.js';
import { cacheReplacementIRs } from './irs.js';
import { cacheReplacementStageView } from './cache-replacement-stage.js';
import { cacheReplacementFacet } from './facet.js';
import { cacheReplacementDescription } from './description.js';

export function registerCacheReplacement(): void {
  // 손잡이(segmented-slider)를 다는 facet 이라 reactive 다. CoroutineMechanism 의
  // supportedControls 에는 '*' 가 없어, 위젯 액션을 만나면 러너가 마운트 전에 throw 한다.
  registerAlgorithm<CacheReplacementData>('cacheReplacement', cacheReplacementAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('cacheReplacementProjector', cacheReplacementProjector);
  for (const ir of cacheReplacementIRs) registerIR(ir.id, ir);
  registerView('cache-replacement-stage', cacheReplacementStageView);
  registerFacets([cacheReplacementFacet]);
  registerDescription(cacheReplacementFacet.id, cacheReplacementDescription);
}

export {
  cacheReplacementAlgorithm,
  cacheReplacementProjector,
  cacheReplacementIRs,
  cacheReplacementStageView,
  cacheReplacementFacet,
  cacheReplacementDescription,
};
export {
  computeCacheReplacementResult,
  policyIndexOf,
  POLICY_RULES,
  type CacheReplacementData,
  type CacheReplacementResult,
  type CachePolicyRule,
  type CacheClock,
  type CachePick,
} from './algorithm.js';
export { cacheReplacementImperativeIR } from './irs.js';
