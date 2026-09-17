/**
 * divideConquerCombine 등록 진입점.
 *
 * 사이드 이펙트로 자동 등록하지 않는다 — 부르는 책임은 호스트 앱에 있다 (S-facet).
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

import { divideConquerCombineAlgorithm } from './algorithm.js';
import { divideConquerCombineScene } from './scene.js';
import { divideConquerCombineIRs } from './irs.js';
import { divideConquerCombineStageView } from './divide-conquer-combine-stage.js';
import { divideConquerCombineFacet } from './facet.js';

export { divideConquerCombineAlgorithm, computeDivideConquerCombinePlan } from './algorithm.js';
export type {
  DivideConquerCombineData,
  DcNode,
  DcSide,
  DcSplitRecord,
  DcMergeRecord,
  DivideConquerPlan,
} from './algorithm.js';
export { divideConquerCombineScene } from './scene.js';
export type { DivideConquerCombineScene, DcFrame, DcMark, DcCaption } from './scene.js';
export { divideConquerCombineIRs } from './irs.js';
export { divideConquerCombineStageView } from './divide-conquer-combine-stage.js';
export { divideConquerCombineFacet } from './facet.js';

export function registerDivideConquerCombine(): void {
  // reactive — 조각은 컨트롤바 없이 스스로 시작하고 걸음 간격도 스스로 정한다 (S-piece).
  registerAlgorithm('divideConquerCombine', divideConquerCombineAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('divideConquerCombineScene', divideConquerCombineScene);
  for (const ir of divideConquerCombineIRs) registerIR(ir.id, ir);
  registerView('divide-conquer-combine-stage', divideConquerCombineStageView);
  registerFacets([divideConquerCombineFacet]);
}
