/**
 * @ffacet/algorithm-decision-boundary — 결정 경계 조각(piece) 번들.
 *
 * mount 하면 스스로 재생한다 (reactive). 컨트롤은 다시 보기와 한 걸음 둘뿐이고
 * 둘 다 눌러야 완성되는 조작이 아니다 — 지나가며 보기만 해도 화면은 할 말을
 * 마친다 (S-piece).
 *
 * `register*` 는 호출하지 않는다. 부르는 것은 호스트 앱의 몫이다 (S-facet).
 */

export {
  decisionBoundary,
  type DecisionBoundaryData,
  type DecisionBoundaryPoint,
} from './algorithm.js';
export { decisionBoundaryProjector } from './projector.js';
export { decisionBoundaryIRs } from './irs.js';
export { decisionBoundaryFacet } from './facet.js';
export { decisionBoundaryDescription } from './description.js';
export {
  decisionBoundaryStageView,
  type DecisionBoundaryStage,
} from './decision-boundary-stage.js';

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { decisionBoundary, type DecisionBoundaryData } from './algorithm.js';
import { decisionBoundaryProjector } from './projector.js';
import { decisionBoundaryIRs } from './irs.js';
import { decisionBoundaryFacet } from './facet.js';
import { decisionBoundaryDescription } from './description.js';
import { decisionBoundaryStageView } from './decision-boundary-stage.js';

export function registerDecisionBoundary(): void {
  registerAlgorithm<DecisionBoundaryData>('decisionBoundary', decisionBoundary, {
    mechanismKind: 'reactive',
  });
  registerProjector('decisionBoundaryProjector', decisionBoundaryProjector);
  for (const ir of decisionBoundaryIRs) registerIR(ir.id, ir);
  registerView('decision-boundary-stage', decisionBoundaryStageView);
  registerFacets([decisionBoundaryFacet]);
  registerDescription(decisionBoundaryFacet.id, decisionBoundaryDescription);
}
