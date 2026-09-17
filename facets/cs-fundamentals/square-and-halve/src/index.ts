/**
 * @ffacet/algorithm-square-and-halve — 분할 거듭제곱 조각(piece) facet 번들.
 *
 * 지수만큼 늘어선 줄을 반으로 접어 가며 3¹³ 에 닿는다. 접을 때마다 남는 홀수
 * 한 칸이 답으로 가고, 그 칸들이 곧 13 의 이진 표기 1101 이다. 자동으로 재생하고
 * 멈추며, 다시 보기와 자취 띠 외에는 조작을 받지 않는다.
 *
 * 화면은 장면(Scene) 으로 만들어진다 — projector 자리를 `scene.ts` 가 잇는다
 * (S-scene).
 *
 * 등록은 호스트 앱의 몫이다 — 이 모듈은 import 만으로 아무것도 등록하지 않는다.
 */

export { squareAndHalve, exponentOf, type SquareAndHalveData } from './algorithm.js';
export {
  squareAndHalveScene,
  bitsOf,
  enteringCountOf,
  multipliesOf,
  naiveOf,
  productOf,
  slotCountOf,
  squaringsOf,
  takenOf,
  totalOf,
  unitsAt,
  type SquareAndHalvePlace,
  type SquareAndHalveRow,
  type SquareAndHalveScene,
  type SquareAndHalveStep,
} from './scene.js';
export { squareAndHalveIRs } from './irs.js';
export { squareAndHalveFacet } from './facet.js';
export { squareAndHalveStageView } from './square-and-halve-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { squareAndHalve, type SquareAndHalveData } from './algorithm.js';
import { squareAndHalveScene } from './scene.js';
import { squareAndHalveIRs } from './irs.js';
import { squareAndHalveFacet } from './facet.js';
import { squareAndHalveStageView } from './square-and-halve-stage.js';

export function registerSquareAndHalve(): void {
  registerAlgorithm<SquareAndHalveData>('squareAndHalve', squareAndHalve, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('squareAndHalveScene', squareAndHalveScene);
  for (const ir of squareAndHalveIRs) registerIR(ir.id, ir);
  registerView('square-and-halve-stage', squareAndHalveStageView);
  registerFacets([squareAndHalveFacet]);
}
