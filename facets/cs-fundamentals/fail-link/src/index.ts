/**
 * fail-link 등록 진입점.
 *
 * 사이드 이펙트로 스스로 등록하지 않는다 — 부르는 것은 호스트 앱의 몫이다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { failLinkAlgorithm, type FailLinkData } from './algorithm.js';
import { failLinkProjector } from './projector.js';
import { failLinkIRs } from './irs.js';
import { failLinkStageView } from './fail-link-stage.js';
import { failLinkFacet } from './facet.js';
import { failLinkDescription } from './description.js';

export { failLinkAlgorithm, failLinkProjector, failLinkIRs, failLinkStageView, failLinkFacet, failLinkDescription };
export type { FailLinkData };

export function registerFailLink(): void {
  // 조각은 스스로 시작하고 스스로 걸음 간격을 정해야 한다 — 둘 다 reactive 만 준다.
  registerAlgorithm<FailLinkData>('failLink', failLinkAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('failLinkProjector', failLinkProjector);
  for (const ir of failLinkIRs) registerIR(ir.id, ir);
  registerView('fail-link-stage', failLinkStageView);
  registerFacets([failLinkFacet]);
  registerDescription(failLinkFacet.id, failLinkDescription);
}
