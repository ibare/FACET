/**
 * @ffacet/algorithm-rotate-to-balance — 회전 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 걸음을 자동 재생하고 멈추며, 다시 보기 단추와 재생
 * 자리를 끄는 띠 외에는 조작을 받지 않는다. 화면은 걸음마다의 장면에서 만들어지므로
 * (`scene.ts`) 어느 걸음으로 끌어도 같은 그림이 선다.
 */

export {
  rotateToBalanceAlgorithm,
  type RotateToBalanceData,
  type RotateNode,
} from './algorithm.js';
export { rotateToBalanceScene, type RotateToBalanceScene } from './scene.js';
export { rotateToBalanceIRs } from './irs.js';
export { rotateToBalanceFacet } from './facet.js';
export { rotateToBalanceStageView } from './rotate-to-balance-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';

import { rotateToBalanceAlgorithm, type RotateToBalanceData } from './algorithm.js';
import { rotateToBalanceScene } from './scene.js';
import { rotateToBalanceIRs } from './irs.js';
import { rotateToBalanceStageView } from './rotate-to-balance-stage.js';
import { rotateToBalanceFacet } from './facet.js';

export function registerRotateToBalance(): void {
  registerAlgorithm<RotateToBalanceData>('rotateToBalance', rotateToBalanceAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('rotateToBalanceScene', rotateToBalanceScene);
  for (const ir of rotateToBalanceIRs) registerIR(ir.id, ir);
  registerView('rotate-to-balance-stage', rotateToBalanceStageView);
  registerFacets([rotateToBalanceFacet]);
}
