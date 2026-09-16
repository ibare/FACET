/**
 * 되짚어 나오기 조각의 등록 진입점.
 *
 * 화면은 명령이 아니라 **장면**으로 만든다 — 걸음마다의 상태를 셈해 두므로 띠로
 * 어느 걸음이든 곧장 갈 수 있다 (S-scene).
 *
 * `registerDiveThenBacktrack()` 는 사이드 이펙트로 불리지 않는다 — 호출 책임은
 * 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { diveThenBacktrackAlgorithm, type DiveThenBacktrackData } from './algorithm.js';
import { diveThenBacktrackScene } from './scene.js';
import { diveThenBacktrackIRs } from './irs.js';
import { diveThenBacktrackFacet } from './facet.js';
import { diveThenBacktrackDescription } from './description.js';
import { diveThenBacktrackStageView } from './dive-then-backtrack-stage.js';

export function registerDiveThenBacktrack(): void {
  registerAlgorithm<DiveThenBacktrackData>('diveThenBacktrack', diveThenBacktrackAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('diveThenBacktrackScene', diveThenBacktrackScene);
  for (const ir of diveThenBacktrackIRs) registerIR(ir.id, ir);
  registerView('dive-then-backtrack-stage', diveThenBacktrackStageView);
  registerFacets([diveThenBacktrackFacet]);
  registerDescription(diveThenBacktrackFacet.id, diveThenBacktrackDescription);
}

// 장면에서 파생되는 셈(`nodeStateOf` 류)은 내보내지 않는다. 그리는 쪽이 패키지
// 안에서 직접 부르므로 공개 표면에 둘 까닭이 없다 (S-facet).
export {
  diveThenBacktrackAlgorithm,
  diveThenBacktrackScene,
  diveThenBacktrackIRs,
  diveThenBacktrackFacet,
  diveThenBacktrackDescription,
  diveThenBacktrackStageView,
};
export type { DiveThenBacktrackData };
export type {
  DiveThenBacktrackScene,
  DiveThenBacktrackStep,
  DiveThenBacktrackCaption,
} from './scene.js';
