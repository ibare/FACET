/**
 * @ffacet/algorithm-lost-link — 연결 유실 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 자동으로 한 번 재생하고 멈추며, 다시 보기와
 * 한 걸음 외에는 조작을 받지 않는다.
 *
 * 등록은 호스트 앱의 책임이다 — 이 모듈은 사이드 이펙트로 자기를 등록하지 않는다.
 */

export { lostLink, type LostLinkData, type LostLinkNode } from './algorithm.js';
export { lostLinkProjector } from './projector.js';
export { lostLinkIRs } from './irs.js';
export { lostLinkFacet } from './facet.js';
export { lostLinkDescription } from './description.js';
export { lostLinkStageView } from './lost-link-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { lostLink, type LostLinkData } from './algorithm.js';
import { lostLinkProjector } from './projector.js';
import { lostLinkIRs } from './irs.js';
import { lostLinkFacet } from './facet.js';
import { lostLinkDescription } from './description.js';
import { lostLinkStageView } from './lost-link-stage.js';

export function registerLostLink(): void {
  registerAlgorithm<LostLinkData>('lostLink', lostLink, {
    mechanismKind: 'reactive',
  });
  registerProjector('lostLinkProjector', lostLinkProjector);
  for (const ir of lostLinkIRs) registerIR(ir.id, ir);
  registerView('lost-link-stage', lostLinkStageView);
  registerFacets([lostLinkFacet]);
  registerDescription(lostLinkFacet.id, lostLinkDescription);
}
