/**
 * @ffacet/algorithm-silent-truncation — 조각 facet 번들.
 *
 * 그릇보다 큰 수를 담으면 윗자리가 그릇 밖으로 떨어져 나가고, 아무도 그것을
 * 알려 주지 않는다는 것을 보인다.
 *
 * algorithm / 장면 설계 / facet JSON / description / 전용 view
 * (silent-truncation-stage) 를 함께 묶고 등록 헬퍼를 제공한다. 부르는 책임은
 * 호스트 앱에 있다 — 이 파일은 사이드 이펙트로 등록하지 않는다 (S-facet).
 */

export { silentTruncation, type SilentTruncationData } from './algorithm.js';
export {
  silentTruncationScene,
  bitsOf,
  keptOf,
  leavingOf,
  lostOf,
  overOf,
  resultsOf,
  type TruncationScene,
  type TruncationHold,
  type TruncationPhase,
  type TruncationCaption,
} from './scene.js';
export { silentTruncationIRs } from './irs.js';
export { silentTruncationFacet } from './facet.js';
export { silentTruncationDescription } from './description.js';
export { silentTruncationStageView } from './silent-truncation-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { silentTruncation, type SilentTruncationData } from './algorithm.js';
import { silentTruncationScene } from './scene.js';
import { silentTruncationIRs } from './irs.js';
import { silentTruncationFacet } from './facet.js';
import { silentTruncationDescription } from './description.js';
import { silentTruncationStageView } from './silent-truncation-stage.js';

export function registerSilentTruncation(): void {
  registerAlgorithm<SilentTruncationData>('silentTruncation', silentTruncation, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('silentTruncationScene', silentTruncationScene);
  for (const ir of silentTruncationIRs) registerIR(ir.id, ir);
  registerView('silent-truncation-stage', silentTruncationStageView);
  registerFacets([silentTruncationFacet]);
  registerDescription(silentTruncationFacet.id, silentTruncationDescription);
}
