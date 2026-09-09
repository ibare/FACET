/**
 * impurityDrops 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 호출 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { impurityDropsAlgorithm, type ImpurityDropsData } from './algorithm.js';
import { impurityDropsDescription } from './description.js';
import { impurityDropsFacet } from './facet.js';
import { impurityDropsIRs } from './irs.js';
import { impurityDropsStageView } from './impurity-drops-stage.js';
import { impurityDropsProjector } from './projector.js';

export { impurityDropsAlgorithm } from './algorithm.js';
export type {
  ImpurityDropsData,
  ImpurityPoint,
  ImpurityCut,
  ImpurityBox,
  BucketWire,
  CutWire,
} from './algorithm.js';
export { impurityDropsProjector } from './projector.js';
export { impurityDropsIRs } from './irs.js';
export { impurityDropsFacet } from './facet.js';
export { impurityDropsDescription } from './description.js';
export { impurityDropsStageView, readImpurityScene } from './impurity-drops-stage.js';
export type { StageBox, StageBucket, StageCut, ImpurityScene } from './impurity-drops-stage.js';

export function registerImpurityDrops(): void {
  registerAlgorithm<ImpurityDropsData>('impurityDrops', impurityDropsAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('impurityDropsProjector', impurityDropsProjector);
  for (const ir of impurityDropsIRs) registerIR(ir.id, ir);
  registerView('impurity-drops-stage', impurityDropsStageView);
  registerFacets([impurityDropsFacet]);
  registerDescription(impurityDropsFacet.id, impurityDropsDescription);
}
