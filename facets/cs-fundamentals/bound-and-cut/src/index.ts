/**
 * boundAndCut 조각의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 등록하지 않는다 — 호출 책임은 호스트 앱에 있다 (S-facet).
 *
 * 화면은 걸음마다의 장면에서 만들어진다 (`scene.ts`). projector 는 없다.
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { boundAndCutAlgorithm } from './algorithm.js';
import { boundAndCutScene } from './scene.js';
import { boundAndCutIRs } from './irs.js';
import { boundAndCutStageView } from './bound-and-cut-stage.js';
import { boundAndCutFacet } from './facet.js';

export {
  boundAndCutAlgorithm,
  traceBoundAndCut,
  sortByDensity,
  packedLoad,
  relaxBound,
  isSettled,
} from './algorithm.js';
export type {
  BoundAndCutData,
  BoundAndCutTrace,
  BoundStep,
  Decision,
  KnapsackItem,
  Relaxation,
} from './algorithm.js';
export { boundAndCutScene } from './scene.js';
export type { BoundAndCutScene, BoundBranch, BoundMark, BoundCaption } from './scene.js';
export { boundAndCutIRs } from './irs.js';
export { boundAndCutStageView } from './bound-and-cut-stage.js';
export { boundAndCutFacet } from './facet.js';

export function registerBoundAndCut(): void {
  registerAlgorithm('boundAndCut', boundAndCutAlgorithm, { mechanismKind: 'reactive' });
  registerScenePlan('boundAndCutScene', boundAndCutScene);
  for (const ir of boundAndCutIRs) registerIR(ir.id, ir);
  registerView('bound-and-cut-stage', boundAndCutStageView);
  registerFacets([boundAndCutFacet]);
}
