/**
 * fail-link 등록 진입점.
 *
 * 사이드 이펙트로 스스로 등록하지 않는다 — 부르는 것은 호스트 앱의 몫이다 (S-facet).
 *
 * 화면은 걸음마다의 장면에서 만들어지므로 (`scene.ts`) projector 대신 `ScenePlan` 을
 * 등록한다. 어느 걸음으로 끌어도 같은 그림이 선다 (S-scene).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { failLinkAlgorithm, type FailLinkData } from './algorithm.js';
import { failLinkScene, type FailLinkScene } from './scene.js';
import { failLinkIRs } from './irs.js';
import { failLinkStageView } from './fail-link-stage.js';
import { failLinkFacet } from './facet.js';
import { failLinkDescription } from './description.js';

export { failLinkAlgorithm, failLinkScene, failLinkIRs, failLinkStageView, failLinkFacet, failLinkDescription };
export type { FailLinkData, FailLinkScene };

export function registerFailLink(): void {
  // 조각은 스스로 시작하고 스스로 걸음 간격을 정해야 한다 — 둘 다 reactive 만 준다.
  registerAlgorithm<FailLinkData>('failLink', failLinkAlgorithm, { mechanismKind: 'reactive' });
  registerScenePlan('failLinkScene', failLinkScene);
  for (const ir of failLinkIRs) registerIR(ir.id, ir);
  registerView('fail-link-stage', failLinkStageView);
  registerFacets([failLinkFacet]);
  registerDescription(failLinkFacet.id, failLinkDescription);
}
