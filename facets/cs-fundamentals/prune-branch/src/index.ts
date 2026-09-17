/**
 * @ffacet/algorithm-prune-branch — 가지치기 조각(piece) facet 번들.
 *
 * 결정나무를 깊이 우선으로 뻗어 내려가다 합이 목표를 넘은 자리에서 닫는다.
 * 열일곱 걸음을 자동으로 재생하고 멈춘다. 화면은 걸음마다의 장면에서 만들어지므로
 * (`scene.ts`) 어느 걸음으로 끌어도 같은 그림이 선다. 다시 보기와 재생 자리를 끄는
 * 띠 외에는 조작을 받지 않으며, 아무것도 누르지 않아도 화면은 할 말을 마친다.
 *
 * 등록은 호스트 앱의 몫이다 — 이 모듈은 import 만으로 아무것도 등록하지 않는다.
 */

export { pruneBranch, pathSum, pickedOnPath, type PruneBranchData } from './algorithm.js';
export {
  pruneBranchScene,
  type BranchVerdict,
  type OpenedSpot,
  type PruneBranchCaption,
  type PruneBranchScene,
  type PruneBranchStep,
} from './scene.js';
export { pruneBranchIRs } from './irs.js';
export { pruneBranchFacet } from './facet.js';
export { pruneBranchDescription } from './description.js';
export { pruneBranchStageView } from './prune-branch-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { pruneBranch, type PruneBranchData } from './algorithm.js';
import { pruneBranchScene } from './scene.js';
import { pruneBranchIRs } from './irs.js';
import { pruneBranchFacet } from './facet.js';
import { pruneBranchDescription } from './description.js';
import { pruneBranchStageView } from './prune-branch-stage.js';

export function registerPruneBranch(): void {
  registerAlgorithm<PruneBranchData>('pruneBranch', pruneBranch, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('pruneBranchScene', pruneBranchScene);
  for (const ir of pruneBranchIRs) registerIR(ir.id, ir);
  registerView('prune-branch-stage', pruneBranchStageView);
  registerFacets([pruneBranchFacet]);
  registerDescription(pruneBranchFacet.id, pruneBranchDescription);
}
