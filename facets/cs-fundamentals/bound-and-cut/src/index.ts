/**
 * boundAndCut 조각의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 등록하지 않는다 — 호출 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { boundAndCutAlgorithm } from './algorithm.js';
import { boundAndCutProjector } from './projector.js';
import { boundAndCutIRs } from './irs.js';
import { boundAndCutStageView } from './bound-and-cut-stage.js';
import { boundAndCutFacet } from './facet.js';
import { boundAndCutDescription } from './description.js';

export { boundAndCutAlgorithm, traceBoundAndCut } from './algorithm.js';
export type {
  BoundAndCutData,
  BoundAndCutTrace,
  BoundStep,
  BranchSnapshot,
  Decision,
  KnapsackItem,
} from './algorithm.js';
export { boundAndCutProjector } from './projector.js';
export { boundAndCutIRs } from './irs.js';
export { boundAndCutStageView } from './bound-and-cut-stage.js';
export { boundAndCutFacet } from './facet.js';
export { boundAndCutDescription } from './description.js';

export function registerBoundAndCut(): void {
  registerAlgorithm('boundAndCut', boundAndCutAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('boundAndCutProjector', boundAndCutProjector);
  for (const ir of boundAndCutIRs) registerIR(ir.id, ir);
  registerView('bound-and-cut-stage', boundAndCutStageView);
  registerFacets([boundAndCutFacet]);
  registerDescription(boundAndCutFacet.id, boundAndCutDescription);
}
