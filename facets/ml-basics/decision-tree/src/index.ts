/**
 * @ffacet/algorithm-decision-tree — 의사결정 트리 완결형 facet 번들.
 *
 * 입력 반응형 (`ReactiveMechanism`). mount 직후 기본 깊이 상한 3 으로 나무가
 * 자라는 것을 한 호흡 보이고, 그 뒤는 컨트롤바가 진행을 준다 — 표준 재생 묶음
 * (`CONTROL_SET.playback`) 위에 **깊이 상한 슬라이더** (1 · 2 · 3 · 4 · 5).
 * 재생 · 멈춤 · 한 걸음은 메커니즘이 지고, 알고리즘은 슬라이더만 본다.
 *
 * algorithm / projector / IR (`ir:decision-tree`) / facet JSON / description /
 * 전용 view (`decision-tree-stage`) 를 함께 번들하고 등록 헬퍼를 제공한다.
 */

export {
  decisionTree,
  growDecisionTree,
  countCorrect,
  summarize,
  type DecisionTreeData,
  type LabeledPoint,
  type NodeOpened,
  type TreeNodeShape,
  type TreeSummary,
} from './algorithm.js';
export { decisionTreeProjector } from './projector.js';
export { decisionTreeGrowIR, decisionTreeIRs } from './irs.js';
export { decisionTreeFacet } from './facet.js';
export { decisionTreeDescription } from './description.js';
export { decisionTreeStageView } from './decision-tree-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { decisionTree, type DecisionTreeData } from './algorithm.js';
import { decisionTreeProjector } from './projector.js';
import { decisionTreeIRs } from './irs.js';
import { decisionTreeFacet } from './facet.js';
import { decisionTreeDescription } from './description.js';
import { decisionTreeStageView } from './decision-tree-stage.js';

export function registerDecisionTree(): void {
  registerAlgorithm<DecisionTreeData>('decisionTree', decisionTree, {
    mechanismKind: 'reactive',
  });
  registerProjector('decisionTreeProjector', decisionTreeProjector);
  for (const ir of decisionTreeIRs) registerIR(ir.id, ir);
  registerView('decision-tree-stage', decisionTreeStageView);
  registerFacets([decisionTreeFacet]);
  registerDescription(decisionTreeFacet.id, decisionTreeDescription);
}
