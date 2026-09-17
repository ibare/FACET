/**
 * @ffacet/algorithm-lost-link — 연결 유실 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 자동으로 한 번 재생하고 멈추며, 다시 보기와
 * 스크럽 띠 외에는 조작을 받지 않는다.
 *
 * 등록은 호스트 앱의 책임이다 — 이 모듈은 사이드 이펙트로 자기를 등록하지 않는다.
 *
 * 화면은 장면(Scene) 방식이다. projector 를 두지 않고 `scene.ts` 가 이벤트를 상태로
 * 옮기며, stage 는 `render(next, prev, { animate })` 하나로 산다 (S-scene).
 */

export { lostLink, type LostLinkData, type LostLinkNode } from './algorithm.js';
export {
  lostLinkScene,
  linkTargets,
  reachableFrom,
  type LostLinkScene,
  type LostLinkNodeScene,
  type LostLinkArrow,
  type LostLinkPlacement,
  type LostLinkMark,
  type LostLinkCaption,
} from './scene.js';
export { lostLinkIRs } from './irs.js';
export { lostLinkFacet } from './facet.js';
export { lostLinkStageView } from './lost-link-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { lostLink, type LostLinkData } from './algorithm.js';
import { lostLinkScene } from './scene.js';
import { lostLinkIRs } from './irs.js';
import { lostLinkFacet } from './facet.js';
import { lostLinkStageView } from './lost-link-stage.js';

export function registerLostLink(): void {
  registerAlgorithm<LostLinkData>('lostLink', lostLink, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('lostLinkScene', lostLinkScene);
  for (const ir of lostLinkIRs) registerIR(ir.id, ir);
  registerView('lost-link-stage', lostLinkStageView);
  registerFacets([lostLinkFacet]);
}
