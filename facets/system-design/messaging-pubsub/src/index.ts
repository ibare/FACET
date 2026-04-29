/**
 * @facet/algorithm-messaging-pubsub — 4-layer Pub/Sub 메시징 facet 번들.
 *
 * 메시지 시퀀스형 + 입력 반응형 (ReactiveMechanism). 자동 시연 (P1·P2 events →
 * P1 alerts → S5 join+subscribe → P3 events → S3 unsubscribe → P1 events) 후
 * 사용자 입력 (publish/subscribe/unsubscribe/reset) 을 1:1 시각 사건으로 매핑.
 *
 * algorithm / projector / facet JSON / description / 전용 view (pubsub-stage)
 * 를 함께 번들하고 등록 헬퍼를 제공한다. 코드 패널은 1차 구현에서 생략.
 */

export {
  messagingPubsub,
  type PubSubFacetData,
  type PubSubInputEvent,
} from './algorithm.js';
export { messagingPubsubProjector } from './projector.js';
export { messagingPubsubIRs } from './irs.js';
export { messagingPubsubFacet } from './facet.js';
export { messagingPubsubDescription } from './description.js';
export { pubsubStageView } from './pubsub-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@facet/core/runtime';
import { messagingPubsub, type PubSubFacetData } from './algorithm.js';
import { messagingPubsubProjector } from './projector.js';
import { messagingPubsubIRs } from './irs.js';
import { messagingPubsubFacet } from './facet.js';
import { messagingPubsubDescription } from './description.js';
import { pubsubStageView } from './pubsub-stage.js';

export function registerMessagingPubsub(): void {
  registerAlgorithm<PubSubFacetData>('messagingPubsub', messagingPubsub, {
    mechanismKind: 'reactive',
  });
  registerProjector('messagingPubsubProjector', messagingPubsubProjector);
  for (const ir of messagingPubsubIRs) registerIR(ir.id, ir);
  registerView('pubsub-stage', pubsubStageView);
  registerFacets([messagingPubsubFacet]);
  registerDescription(messagingPubsubFacet.id, messagingPubsubDescription);
}
