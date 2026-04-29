/**
 * @facet/algorithm-caching-cdn — 4-layer CDN 시스템 행동 facet 번들.
 *
 * 입력 반응형 (ReactiveMechanism). 자동 시연 (서울·도쿄·프랑크푸르트 미스 →
 * 동일 도시 두 번째 클라이언트 히트 시퀀스) 후 사용자 입력 (request /
 * auto-demo / reset) 을 1:1 시각 사건으로 매핑.
 *
 * algorithm / projector / facet JSON / description / 전용 view (cdn-stage)
 * 를 함께 번들하고 등록 헬퍼를 제공한다. 코드 패널은 1차 구현에서 생략.
 */

export {
  cachingCdn,
  type CdnFacetData,
  type CdnInputEvent,
  type EdgeInit,
  type ContentInit,
  type AutoDemoStep,
} from './algorithm.js';
export { cachingCdnProjector } from './projector.js';
export { cachingCdnIRs } from './irs.js';
export { cachingCdnFacet } from './facet.js';
export { cachingCdnDescription } from './description.js';
export { cdnStageView } from './cdn-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@facet/core/runtime';
import { cachingCdn, type CdnFacetData } from './algorithm.js';
import { cachingCdnProjector } from './projector.js';
import { cachingCdnIRs } from './irs.js';
import { cachingCdnFacet } from './facet.js';
import { cachingCdnDescription } from './description.js';
import { cdnStageView } from './cdn-stage.js';

export function registerCachingCdn(): void {
  registerAlgorithm<CdnFacetData>('cachingCdn', cachingCdn, {
    mechanismKind: 'reactive',
  });
  registerProjector('cachingCdnProjector', cachingCdnProjector);
  for (const ir of cachingCdnIRs) registerIR(ir.id, ir);
  registerView('cdn-stage', cdnStageView);
  registerFacets([cachingCdnFacet]);
  registerDescription(cachingCdnFacet.id, cachingCdnDescription);
}
