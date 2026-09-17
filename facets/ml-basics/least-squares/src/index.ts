/**
 * @ffacet/algorithm-least-squares — 최소제곱 조각 번들.
 *
 * 조각(piece)이므로 reactive 로 돌며 mount 직후 스스로 재생한다. 화면을 명령이
 * 아니라 장면(Scene)으로 만들므로 컨트롤은 다시 보기와 띠 둘이고, 둘 다 눌러야
 * 완성되는 조작이 아니다 (S-piece).
 *
 * 등록 호출은 호스트가 한다. 이 파일은 진입점만 내보낸다.
 */

export {
  leastSquares,
  type LeastSquaresData,
  type LeastSquaresLine,
  type LeastSquaresPoint,
} from './algorithm.js';
export { leastSquaresScene } from './scene.js';
export type {
  LeastSquaresScene,
  LeastSquaresStep,
  LeastSquaresTrace,
  Measure,
} from './scene.js';
export { leastSquaresIRs } from './irs.js';
export { leastSquaresFacet } from './facet.js';
export { leastSquaresDescription } from './description.js';
export { leastSquaresStageView } from './least-squares-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { leastSquares, type LeastSquaresData } from './algorithm.js';
import { leastSquaresScene } from './scene.js';
import { leastSquaresIRs } from './irs.js';
import { leastSquaresFacet } from './facet.js';
import { leastSquaresDescription } from './description.js';
import { leastSquaresStageView } from './least-squares-stage.js';

export function registerLeastSquares(): void {
  registerAlgorithm<LeastSquaresData>('leastSquares', leastSquares, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('leastSquaresScene', leastSquaresScene);
  for (const ir of leastSquaresIRs) registerIR(ir.id, ir);
  registerView('least-squares-stage', leastSquaresStageView);
  registerFacets([leastSquaresFacet]);
  registerDescription(leastSquaresFacet.id, leastSquaresDescription);
}
