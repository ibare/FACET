/**
 * @facet/algorithm-ip-routing — 4-layer IP 라우팅 facet 번들.
 *
 * 메시지 시퀀스형 + 입력 반응형 (ReactiveMechanism). 자동 시연 (정상 도착 / R4 분기 /
 * default 외부 / TTL=2 폐기) 4 발신 후 사용자 입력 (send/step-hop/auto-demo/
 * pause/resume/ttl-default/reset) 을 1:1 시각 사건으로 매핑.
 *
 * algorithm / projector / facet JSON / description / 전용 view (ip-routing-stage)
 * 를 함께 번들하고 등록 헬퍼를 제공한다. 코드 패널은 1차 구현에서 생략.
 */

export {
  ipRouting,
  type IpRoutingData,
  type IpRoutingInputEvent,
} from './algorithm.js';
export { ipRoutingProjector } from './projector.js';
export { ipRoutingIRs } from './irs.js';
export { ipRoutingFacet } from './facet.js';
export { ipRoutingDescription } from './description.js';
export { ipRoutingStageView } from './ip-routing-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@facet/core/runtime';
import { ipRouting, type IpRoutingData } from './algorithm.js';
import { ipRoutingProjector } from './projector.js';
import { ipRoutingIRs } from './irs.js';
import { ipRoutingFacet } from './facet.js';
import { ipRoutingDescription } from './description.js';
import { ipRoutingStageView } from './ip-routing-stage.js';

export function registerIpRouting(): void {
  registerAlgorithm<IpRoutingData>('ipRouting', ipRouting, {
    mechanismKind: 'reactive',
  });
  registerProjector('ipRoutingProjector', ipRoutingProjector);
  for (const ir of ipRoutingIRs) registerIR(ir.id, ir);
  registerView('ip-routing-stage', ipRoutingStageView);
  registerFacets([ipRoutingFacet]);
  registerDescription(ipRoutingFacet.id, ipRoutingDescription);
}
