/**
 * @ffacet/algorithm-long-task-blocks — 긴 태스크가 클릭을 막는 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 여덟 걸음을 자동 재생하고 정지하며, 다시 보기와 띠
 * 외에는 조작을 받지 않는다.
 *
 * 화면은 명령이 아니라 **장면**에서 만들어지므로 어느 걸음으로든 곧장 갈 수 있다
 * (S-scene). 부르는 책임은 호스트에 있다 — 여기서 사이드 이펙트로 부르지 않는다
 * (S-facet).
 */

export { longTaskBlocks, type LongTaskBlocksFacetData } from './algorithm.js';
export { longTaskBlocksIRs } from './irs.js';
export { longTaskBlocksFacet } from './facet.js';
export { longTaskBlocksStageView } from './long-task-blocks-stage.js';
export {
  longTaskBlocksScene,
  type LongTaskBlocksClick,
  type LongTaskBlocksProcessed,
  type LongTaskBlocksScene,
  type LongTaskBlocksStep,
} from './scene.js';

import { registerAlgorithm, registerScenePlan, registerIR, registerFacets, registerView } from '@ffacet/core/runtime';
import { longTaskBlocks, type LongTaskBlocksFacetData } from './algorithm.js';
import { longTaskBlocksIRs } from './irs.js';
import { longTaskBlocksFacet } from './facet.js';
import { longTaskBlocksStageView } from './long-task-blocks-stage.js';
import { longTaskBlocksScene } from './scene.js';

export function registerLongTaskBlocks(): void {
  registerAlgorithm<LongTaskBlocksFacetData>('longTaskBlocks', longTaskBlocks, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('longTaskBlocksScene', longTaskBlocksScene);
  for (const ir of longTaskBlocksIRs) registerIR(ir.id, ir);
  registerView('long-task-blocks-stage', longTaskBlocksStageView);
  registerFacets([longTaskBlocksFacet]);
}
