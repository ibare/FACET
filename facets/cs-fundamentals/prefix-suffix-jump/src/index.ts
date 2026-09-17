/**
 * prefix-suffix-jump 등록 진입점.
 *
 * 화면은 장면(Scene) 방식이다 — 이벤트가 `PrefixSuffixJumpScene` 으로 쌓이고 stage 의
 * `render` 하나가 그 장면을 통째로 세운다. 그래서 스크럽 띠로 아무 걸음에나 갈 수
 * 있다 (S-scene).
 *
 * 부수효과로 스스로 부르지 않는다 — 호출 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { prefixSuffixJumpAlgorithm, type PrefixSuffixJumpData } from './algorithm.js';
import { prefixSuffixJumpScene } from './scene.js';
import { prefixSuffixJumpIRs } from './irs.js';
import { prefixSuffixJumpStageView } from './prefix-suffix-jump-stage.js';
import { prefixSuffixJumpFacet } from './facet.js';

export {
  prefixSuffixJumpAlgorithm,
  prefixSuffixJumpScene,
  prefixSuffixJumpIRs,
  prefixSuffixJumpStageView,
  prefixSuffixJumpFacet,
};
export type { PrefixSuffixJumpData };
export type {
  PrefixSuffixJumpBase,
  PrefixSuffixJumpCaption,
  PrefixSuffixJumpScene,
  PrefixSuffixJumpStep,
} from './scene.js';

export function registerPrefixSuffixJump(): void {
  // 조각은 스스로 시작하고 걸음 간격도 스스로 정한다 (S-piece).
  registerAlgorithm<PrefixSuffixJumpData>('prefixSuffixJump', prefixSuffixJumpAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('prefixSuffixJumpScene', prefixSuffixJumpScene);
  for (const ir of prefixSuffixJumpIRs) registerIR(ir.id, ir);
  registerView('prefix-suffix-jump-stage', prefixSuffixJumpStageView);
  registerFacets([prefixSuffixJumpFacet]);
}
