/**
 * @ffacet/algorithm-square-and-halve — 분할 거듭제곱 조각(piece) facet 번들.
 *
 * 지수만큼 늘어선 줄을 반으로 접어 가며 3¹³ 에 닿는다. 접을 때마다 남는 홀수
 * 한 칸이 답으로 가고, 그 칸들이 곧 13 의 이진 표기 1101 이다. 자동으로 재생하고
 * 멈추며, 다시 보기와 한 걸음 외에는 조작을 받지 않는다.
 *
 * 등록은 호스트 앱의 몫이다 — 이 모듈은 import 만으로 아무것도 등록하지 않는다.
 */

export { squareAndHalve, type SquareAndHalveData } from './algorithm.js';
export { squareAndHalveProjector } from './projector.js';
export { squareAndHalveIRs } from './irs.js';
export { squareAndHalveFacet } from './facet.js';
export { squareAndHalveDescription } from './description.js';
export {
  squareAndHalveStageView,
  type SquareAndHalveStageInit,
} from './square-and-halve-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { squareAndHalve, type SquareAndHalveData } from './algorithm.js';
import { squareAndHalveProjector } from './projector.js';
import { squareAndHalveIRs } from './irs.js';
import { squareAndHalveFacet } from './facet.js';
import { squareAndHalveDescription } from './description.js';
import { squareAndHalveStageView } from './square-and-halve-stage.js';

export function registerSquareAndHalve(): void {
  registerAlgorithm<SquareAndHalveData>('squareAndHalve', squareAndHalve, {
    mechanismKind: 'reactive',
  });
  registerProjector('squareAndHalveProjector', squareAndHalveProjector);
  for (const ir of squareAndHalveIRs) registerIR(ir.id, ir);
  registerView('square-and-halve-stage', squareAndHalveStageView);
  registerFacets([squareAndHalveFacet]);
  registerDescription(squareAndHalveFacet.id, squareAndHalveDescription);
}
