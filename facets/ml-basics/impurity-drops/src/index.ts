/**
 * impurityDrops 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 호출 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { impurityDropsAlgorithm, type ImpurityDropsData } from './algorithm.js';
import { impurityDropsFacet } from './facet.js';
import { impurityDropsIRs } from './irs.js';
import { impurityDropsStageView } from './impurity-drops-stage.js';
import { impurityDropsScene } from './scene.js';

export { impurityDropsAlgorithm, tallyOf, IMPURITY_ROOT_BOX } from './algorithm.js';
export type {
  ImpurityDropsData,
  ImpurityPoint,
  ImpurityCut,
  ImpurityBox,
  BucketWire,
  CutWire,
} from './algorithm.js';
export {
  impurityDropsScene,
  bucketsOf,
  classCountOf,
  countOf,
  currentLevelOf,
  dropOf,
  giniOf,
  lastCutsOf,
  levelOf,
  previousBucketsOf,
  previousLevelOf,
  pureClassOf,
  totalOf,
} from './scene.js';
export type {
  ImpurityBucket,
  ImpurityCutMark,
  ImpurityDropsScene,
  ImpurityStep,
} from './scene.js';
export { impurityDropsIRs } from './irs.js';
export { impurityDropsFacet } from './facet.js';
export { impurityDropsStageView } from './impurity-drops-stage.js';

export function registerImpurityDrops(): void {
  registerAlgorithm<ImpurityDropsData>('impurityDrops', impurityDropsAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('impurityDropsScene', impurityDropsScene);
  for (const ir of impurityDropsIRs) registerIR(ir.id, ir);
  registerView('impurity-drops-stage', impurityDropsStageView);
  registerFacets([impurityDropsFacet]);
}
