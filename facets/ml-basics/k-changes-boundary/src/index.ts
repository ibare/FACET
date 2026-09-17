/**
 * @ffacet/algorithm-k-changes-boundary — "k 가 답을 바꾼다" 조각 번들.
 *
 * 반응형(ReactiveMechanism). mount 하면 스스로 한 바퀴 돌고, 그 뒤로는 다시 보기와
 * 띠로 곱씹을 수 있다. 화면은 명령이 아니라 **장면**에서 만들어지므로 어느 걸음으로든
 * 곧장 갈 수 있다 (S-scene). 등록 호출은 호스트가 한다.
 */

export {
  kChangesBoundary,
  effectiveK,
  type KChangesBoundaryData,
  type LabeledPoint,
} from './algorithm.js';
export {
  kChangesBoundaryScene,
  type KChangesBoundaryScene,
  type KStep,
  type ScenePoint,
} from './scene.js';
export { kChangesBoundaryIRs } from './irs.js';
export { kChangesBoundaryFacet } from './facet.js';
export { kChangesBoundaryDescription } from './description.js';
export { kChangesBoundaryStageView } from './k-changes-boundary-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { kChangesBoundary, type KChangesBoundaryData } from './algorithm.js';
import { kChangesBoundaryScene } from './scene.js';
import { kChangesBoundaryIRs } from './irs.js';
import { kChangesBoundaryFacet } from './facet.js';
import { kChangesBoundaryDescription } from './description.js';
import { kChangesBoundaryStageView } from './k-changes-boundary-stage.js';

export function registerKChangesBoundary(): void {
  registerAlgorithm<KChangesBoundaryData>('kChangesBoundary', kChangesBoundary, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('kChangesBoundaryScene', kChangesBoundaryScene);
  for (const ir of kChangesBoundaryIRs) registerIR(ir.id, ir);
  registerView('k-changes-boundary-stage', kChangesBoundaryStageView);
  registerFacets([kChangesBoundaryFacet]);
  registerDescription(kChangesBoundaryFacet.id, kChangesBoundaryDescription);
}
