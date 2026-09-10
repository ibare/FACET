/**
 * @ffacet/algorithm-hierarchical — 계층 군집화 (agglomerative clustering) facet 번들.
 *
 * 반응형 (`ReactiveMechanism`). mount 직후 단일 연결로 일곱 걸음을 한 걸음씩
 * 자동 시연한 뒤 위젯 입력을 기다린다. 컨트롤바는 재생 다섯 + 연결 방식
 * segmented-slider (단일 · 완전 · 평균) + 자르는 높이 segmented-slider (여섯).
 *
 * algorithm / projector / IR / facet JSON / description / 전용 view
 * (hierarchical-stage) 를 함께 번들하고 등록 헬퍼를 제공한다.
 */

export {
  hierarchical,
  groupsAtCut,
  clusterCountAtCut,
  type HierarchicalData,
  type HierarchicalPoint,
  type HierarchicalMerge,
  type HierarchicalInputEvent,
} from './algorithm.js';
export { hierarchicalProjector } from './projector.js';
export { hierarchicalIRs, hierarchicalMergeIR } from './irs.js';
export { hierarchicalFacet } from './facet.js';
export { hierarchicalDescription } from './description.js';
export {
  hierarchicalStageView,
  type StageScene,
  type StageMerge,
  type LedgerRow,
} from './hierarchical-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { hierarchical, type HierarchicalData } from './algorithm.js';
import { hierarchicalProjector } from './projector.js';
import { hierarchicalIRs } from './irs.js';
import { hierarchicalFacet } from './facet.js';
import { hierarchicalDescription } from './description.js';
import { hierarchicalStageView } from './hierarchical-stage.js';

export function registerHierarchical(): void {
  registerAlgorithm<HierarchicalData>('hierarchical', hierarchical, {
    mechanismKind: 'reactive',
  });
  registerProjector('hierarchicalProjector', hierarchicalProjector);
  for (const ir of hierarchicalIRs) registerIR(ir.id, ir);
  registerView('hierarchical-stage', hierarchicalStageView);
  registerFacets([hierarchicalFacet]);
  registerDescription(hierarchicalFacet.id, hierarchicalDescription);
}
