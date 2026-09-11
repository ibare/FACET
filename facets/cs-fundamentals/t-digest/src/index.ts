/**
 * t-digest facet 등록 진입점.
 *
 * 등록을 사이드 이펙트로 하지 않는다 — 부르는 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { tDigestAlgorithm, type TDigestData } from './algorithm.js';
import { tDigestProjector } from './projector.js';
import { tDigestIRs } from './irs.js';
import { tDigestStageView } from './t-digest-stage.js';
import { tDigestFacet } from './facet.js';
import { tDigestDescription } from './description.js';

export {
  tDigestAlgorithm,
  tDigestBoundaries,
  tDigestBuckets,
  tDigestQuery,
  tDigestValueError,
  tDigestValues,
  trueQuantile,
} from './algorithm.js';
export type { TDigestBucket, TDigestData } from './algorithm.js';
export { tDigestProjector } from './projector.js';
export { tDigestIRs } from './irs.js';
export { tDigestStageView } from './t-digest-stage.js';
export { tDigestFacet } from './facet.js';
export { tDigestDescription } from './description.js';

export function registerTDigest(): void {
  // 손잡이가 있는 완제품이라 reactive 다. 세 상태 — 나아가는 중 · 멈춤 ·
  // 입력 대기 — 는 ReactiveMechanism 이 진다.
  registerAlgorithm<TDigestData>('tDigest', tDigestAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('tDigestProjector', tDigestProjector);
  for (const ir of tDigestIRs) registerIR(ir.id, ir);
  registerView('t-digest-stage', tDigestStageView);
  registerFacets([tDigestFacet]);
  registerDescription(tDigestFacet.id, tDigestDescription);
}
