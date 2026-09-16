/**
 * @ffacet/algorithm-split-when-full — 노드 분할 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 네 걸음(descend → overflow → promote → divide)을
 * 자동 재생하고 멈춘 뒤, 다시 보기 단추와 재생 자리를 끄는 띠 외에는 조작을 받지
 * 않는다. 화면은 걸음마다의 장면에서 만들어지므로 (`scene.ts`) 어느 걸음으로
 * 끌어도 같은 그림이 선다.
 */

export {
  splitWhenFull,
  type SplitWhenFullData,
  type SplitWhenFullNode,
  type DescendPayload,
  type OverflowPayload,
  type PromotePayload,
  type DividePayload,
} from './algorithm.js';
export { splitWhenFullScene, type SplitWhenFullScene } from './scene.js';
export { splitWhenFullIRs } from './irs.js';
export { splitWhenFullFacet } from './facet.js';
export { splitWhenFullDescription } from './description.js';
export { splitWhenFullStageView } from './split-when-full-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { splitWhenFull, type SplitWhenFullData } from './algorithm.js';
import { splitWhenFullScene } from './scene.js';
import { splitWhenFullIRs } from './irs.js';
import { splitWhenFullFacet } from './facet.js';
import { splitWhenFullDescription } from './description.js';
import { splitWhenFullStageView } from './split-when-full-stage.js';

export function registerSplitWhenFull(): void {
  registerAlgorithm<SplitWhenFullData>('splitWhenFull', splitWhenFull, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('splitWhenFullScene', splitWhenFullScene);
  for (const ir of splitWhenFullIRs) registerIR(ir.id, ir);
  registerView('split-when-full-stage', splitWhenFullStageView);
  registerFacets([splitWhenFullFacet]);
  registerDescription(splitWhenFullFacet.id, splitWhenFullDescription);
}
