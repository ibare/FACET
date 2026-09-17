/**
 * @ffacet/algorithm-floating-point — 부동소수점 완제품의 등록 진입점.
 *
 * `registerFloatingPoint()` 는 호스트 앱이 부른다. 이 모듈이 import 되는 것만으로
 * 등록되지 않는다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { floatingPointAlgorithm, type FloatingPointData } from './algorithm.js';
import { floatingPointProjector } from './projector.js';
import { floatingPointIRs } from './irs.js';
import { floatingPointStageView } from './floating-point-stage.js';
import { floatingPointFacet } from './facet.js';

export {
  floatingPointAlgorithm,
  computeFloatingPointFormat,
  storeInFormat,
  type FloatingPointData,
  type FloatingPointFormat,
} from './algorithm.js';
export { floatingPointProjector } from './projector.js';
export { floatingPointImperativeIR, floatingPointIRs } from './irs.js';
export { floatingPointStageView } from './floating-point-stage.js';
export { floatingPointFacet } from './facet.js';

export function registerFloatingPoint(): void {
  // 손잡이가 알고리즘의 인자를 바꾸므로 reactive 다 — coroutine 은
  // `supportedControls` 에 `'*'` 가 없어 `action: 'expBits'` 에서 던진다.
  registerAlgorithm<FloatingPointData>('floatingPoint', floatingPointAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('floatingPointProjector', floatingPointProjector);
  for (const ir of floatingPointIRs) registerIR(ir.id, ir);
  registerView('floating-point-stage', floatingPointStageView);
  registerFacets([floatingPointFacet]);
}
