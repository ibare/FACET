/**
 * @ffacet/algorithm-guess-by-value — 보간 추정 조각(piece) facet 번들.
 *
 * 두 방식이 같은 배열을 훑는 열한 걸음을 자동으로 재생하고 멈춘다. 다시 보기와
 * 스크럽 띠 외에는 조작을 받지 않으며, 아무것도 누르지 않아도 화면은 할 말을 마친다.
 *
 * 화면은 명령이 아니라 **장면**으로 만든다 — 어느 걸음의 화면이든 셈으로 얻으므로
 * 띠를 끌어 임의의 자리로 갈 수 있다 (S-scene).
 *
 * 등록은 호스트 앱의 몫이다 — 이 모듈은 import 만으로 아무것도 등록하지 않는다.
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import {
  aimShots,
  guessByValueAlgorithm,
  midSteps,
  type AimShot,
  type GuessByValueData,
  type MidStep,
} from './algorithm.js';
import { guessByValueScene } from './scene.js';
import { guessByValueIRs } from './irs.js';
import { guessByValueStageView } from './guess-by-value-stage.js';
import { guessByValueFacet } from './facet.js';
import { guessByValueDescription } from './description.js';

export {
  aimShots,
  guessByValueAlgorithm,
  guessByValueDescription,
  guessByValueFacet,
  guessByValueIRs,
  guessByValueScene,
  guessByValueStageView,
  midSteps,
};
export type { AimShot, GuessByValueData, MidStep };
export type {
  GuessByValueAimStage,
  GuessByValueCaption,
  GuessByValueLaneState,
  GuessByValueScene,
  GuessByValueSpan,
  GuessByValueStep,
} from './scene.js';

export function registerGuessByValue(): void {
  registerAlgorithm<GuessByValueData>('guessByValue', guessByValueAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('guessByValueScene', guessByValueScene);
  for (const ir of guessByValueIRs) registerIR(ir.id, ir);
  registerView('guess-by-value-stage', guessByValueStageView);
  registerFacets([guessByValueFacet]);
  registerDescription(guessByValueFacet.id, guessByValueDescription);
}
