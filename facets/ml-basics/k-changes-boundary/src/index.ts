/**
 * @ffacet/algorithm-k-changes-boundary — "k 가 답을 바꾼다" 조각 번들.
 *
 * 반응형(ReactiveMechanism). mount 하면 스스로 한 바퀴 돌고, 그 뒤로는 다시
 * 보기와 한 걸음으로 곱씹을 수 있다. 등록 호출은 호스트가 한다.
 */

export { kChangesBoundary, type KChangesBoundaryData, type LabeledPoint } from './algorithm.js';
export { kChangesBoundaryProjector } from './projector.js';
export { kChangesBoundaryIRs } from './irs.js';
export { kChangesBoundaryFacet } from './facet.js';
export { kChangesBoundaryDescription } from './description.js';
export { kChangesBoundaryStageView } from './k-changes-boundary-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { kChangesBoundary, type KChangesBoundaryData } from './algorithm.js';
import { kChangesBoundaryProjector } from './projector.js';
import { kChangesBoundaryIRs } from './irs.js';
import { kChangesBoundaryFacet } from './facet.js';
import { kChangesBoundaryDescription } from './description.js';
import { kChangesBoundaryStageView } from './k-changes-boundary-stage.js';

export function registerKChangesBoundary(): void {
  registerAlgorithm<KChangesBoundaryData>('kChangesBoundary', kChangesBoundary, {
    mechanismKind: 'reactive',
  });
  registerProjector('kChangesBoundaryProjector', kChangesBoundaryProjector);
  for (const ir of kChangesBoundaryIRs) registerIR(ir.id, ir);
  registerView('k-changes-boundary-stage', kChangesBoundaryStageView);
  registerFacets([kChangesBoundaryFacet]);
  registerDescription(kChangesBoundaryFacet.id, kChangesBoundaryDescription);
}
