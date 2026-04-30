/**
 * @facet/algorithm-conditional-statement — 조건문 (if/else if/else) facet 번들.
 *
 * 입력 반응형 (ReactiveMechanism). view 인-스테이지 슬라이더 0..100 정수가
 * 평가 마름모의 응결과 활성 가지를 직접 흔든다. 컨트롤바는 갈래 2/3 토글 +
 * auto-demo + reset.
 *
 * algorithm / projector / facet JSON / description / 전용 view (conditional-flowchart)
 * 를 함께 번들하고 등록 헬퍼를 제공한다. 코드 패널은 1차 구현에서 생략.
 */

export {
  conditionalStatement,
  type ConditionalFacetData,
  type ConditionalInputEvent,
  type ConditionalMode,
  type ConditionalRule,
  type ConditionalRuleSet,
  type ConditionalElse,
  type EvaluationStep,
  type EvaluationOutcome,
} from './algorithm.js';
export { conditionalStatementProjector } from './projector.js';
export { conditionalStatementIRs } from './irs.js';
export { conditionalStatementFacet } from './facet.js';
export { conditionalStatementDescription } from './description.js';
export { conditionalFlowchartView } from './conditional-flowchart.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@facet/core/runtime';
import {
  conditionalStatement,
  type ConditionalFacetData,
} from './algorithm.js';
import { conditionalStatementProjector } from './projector.js';
import { conditionalStatementIRs } from './irs.js';
import { conditionalStatementFacet } from './facet.js';
import { conditionalStatementDescription } from './description.js';
import { conditionalFlowchartView } from './conditional-flowchart.js';

export function registerConditionalStatement(): void {
  registerAlgorithm<ConditionalFacetData>(
    'conditionalStatement',
    conditionalStatement,
    { mechanismKind: 'reactive' },
  );
  registerProjector(
    'conditionalStatementProjector',
    conditionalStatementProjector,
  );
  for (const ir of conditionalStatementIRs) registerIR(ir.id, ir);
  registerView('conditional-flowchart', conditionalFlowchartView);
  registerFacets([conditionalStatementFacet]);
  registerDescription(
    conditionalStatementFacet.id,
    conditionalStatementDescription,
  );
}
