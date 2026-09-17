/**
 * @ffacet/algorithm-decision-boundary — 결정 경계 조각(piece) 번들.
 *
 * mount 하면 스스로 재생한다 (reactive). 컨트롤은 다시 보기와 띠 둘뿐이고
 * 둘 다 눌러야 완성되는 조작이 아니다 — 지나가며 보기만 해도 화면은 할 말을
 * 마친다 (S-piece).
 *
 * 화면은 명령이 아니라 **장면**으로 만든다 — algorithm / 장면 설계 / facet JSON /
 * description / 전용 view 를 함께 번들하고 등록 헬퍼를 제공한다 (S-scene).
 *
 * `register*` 는 호출하지 않는다. 부르는 것은 호스트 앱의 몫이다 (S-facet).
 */

export {
  decisionBoundary,
  decisionCrossings,
  decisionField,
  decisionProbability,
  decisionScore,
  decisionWaveSize,
  DECISION_HALF,
  type DecisionBoundaryData,
  type DecisionBoundaryPoint,
  type DecisionModel,
} from './algorithm.js';
export {
  decisionBoundaryScene,
  type BoundaryReading,
  type DecisionBoundaryCaption,
  type DecisionBoundaryScene,
  type DecisionBoundaryStep,
  type PointReading,
} from './scene.js';
export { decisionBoundaryIRs } from './irs.js';
export { decisionBoundaryFacet } from './facet.js';
export { decisionBoundaryDescription } from './description.js';
export { decisionBoundaryStageView } from './decision-boundary-stage.js';

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { decisionBoundary, type DecisionBoundaryData } from './algorithm.js';
import { decisionBoundaryScene } from './scene.js';
import { decisionBoundaryIRs } from './irs.js';
import { decisionBoundaryFacet } from './facet.js';
import { decisionBoundaryDescription } from './description.js';
import { decisionBoundaryStageView } from './decision-boundary-stage.js';

export function registerDecisionBoundary(): void {
  registerAlgorithm<DecisionBoundaryData>('decisionBoundary', decisionBoundary, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('decisionBoundaryScene', decisionBoundaryScene);
  for (const ir of decisionBoundaryIRs) registerIR(ir.id, ir);
  registerView('decision-boundary-stage', decisionBoundaryStageView);
  registerFacets([decisionBoundaryFacet]);
  registerDescription(decisionBoundaryFacet.id, decisionBoundaryDescription);
}
