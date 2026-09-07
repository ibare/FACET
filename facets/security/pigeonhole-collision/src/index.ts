/**
 * @ffacet/algorithm-pigeonhole-collision — 비둘기집 충돌 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 네 걸음을 자동 재생하고 정지하며, 다시 보기 버튼
 * 하나 외에는 조작을 받지 않는다. ReactiveMechanism 이라 컨트롤바 없이 스스로
 * 재생하고 걸음 간격도 스스로 정한다 (ctx.sleep).
 *
 * algorithm / projector / facet JSON / description / 전용 view (pigeonhole-stage)
 * 를 함께 번들하고 등록 헬퍼를 제공한다. 코드 패널은 두지 않는다.
 */

export {
  pigeonholeCollision,
  type PigeonholeFacetData,
  type PigeonholeEntry,
} from './algorithm.js';
export { pigeonholeCollisionProjector } from './projector.js';
export { pigeonholeCollisionIRs } from './irs.js';
export { pigeonholeCollisionFacet } from './facet.js';
export { pigeonholeCollisionDescription } from './description.js';
export { pigeonholeStageView } from './pigeonhole-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { pigeonholeCollision, type PigeonholeFacetData } from './algorithm.js';
import { pigeonholeCollisionProjector } from './projector.js';
import { pigeonholeCollisionIRs } from './irs.js';
import { pigeonholeCollisionFacet } from './facet.js';
import { pigeonholeCollisionDescription } from './description.js';
import { pigeonholeStageView } from './pigeonhole-stage.js';

export function registerPigeonholeCollision(): void {
  registerAlgorithm<PigeonholeFacetData>('pigeonholeCollision', pigeonholeCollision, {
    mechanismKind: 'reactive',
  });
  registerProjector('pigeonholeCollisionProjector', pigeonholeCollisionProjector);
  for (const ir of pigeonholeCollisionIRs) registerIR(ir.id, ir);
  registerView('pigeonhole-stage', pigeonholeStageView);
  registerFacets([pigeonholeCollisionFacet]);
  registerDescription(pigeonholeCollisionFacet.id, pigeonholeCollisionDescription);
}
