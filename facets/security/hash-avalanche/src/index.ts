/**
 * @ffacet/algorithm-hash-avalanche — 해시 눈사태 효과 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 여섯 걸음을 자동 재생하고 정지하며, 학습자 입력을
 * 받지 않는다. ReactiveMechanism 이라 컨트롤바 없이 스스로 재생하고, 걸음
 * 간격도 스스로 정한다 (ctx.sleep).
 *
 * algorithm / projector / facet JSON / description / 전용 view (avalanche-stage)
 * 를 함께 번들하고 등록 헬퍼를 제공한다. 코드 패널은 두지 않는다.
 */

export { hashAvalanche, type HashAvalancheFacetData } from './algorithm.js';
export { hashAvalancheProjector } from './projector.js';
export { hashAvalancheIRs } from './irs.js';
export { hashAvalancheFacet } from './facet.js';
export { hashAvalancheDescription } from './description.js';
export { avalancheStageView } from './avalanche-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { hashAvalanche, type HashAvalancheFacetData } from './algorithm.js';
import { hashAvalancheProjector } from './projector.js';
import { hashAvalancheIRs } from './irs.js';
import { hashAvalancheFacet } from './facet.js';
import { hashAvalancheDescription } from './description.js';
import { avalancheStageView } from './avalanche-stage.js';

export function registerHashAvalanche(): void {
  registerAlgorithm<HashAvalancheFacetData>('hashAvalanche', hashAvalanche, {
    mechanismKind: 'reactive',
  });
  registerProjector('hashAvalancheProjector', hashAvalancheProjector);
  for (const ir of hashAvalancheIRs) registerIR(ir.id, ir);
  registerView('avalanche-stage', avalancheStageView);
  registerFacets([hashAvalancheFacet]);
  registerDescription(hashAvalancheFacet.id, hashAvalancheDescription);
}
