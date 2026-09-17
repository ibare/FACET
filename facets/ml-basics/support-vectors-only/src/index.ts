/**
 * support-vectors-only 등록 진입점.
 *
 * 부르는 것은 호스트다. 이 파일은 스스로 부르지 않는다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { supportVectorsOnlyAlgorithm } from './algorithm.js';
import { supportVectorsOnlyDescription } from './description.js';
import { supportVectorsOnlyFacet } from './facet.js';
import { supportVectorsOnlyIRs } from './irs.js';
import { supportVectorsOnlyScene } from './scene.js';
import { supportVectorsOnlyStageView } from './support-vectors-only-stage.js';

export { supportVectorsOnlyAlgorithm } from './algorithm.js';
export type {
  SupportVectorsOnlyData,
  SupportVectorsOnlyEdit,
  SupportVectorsOnlyPoint,
} from './algorithm.js';
export { supportVectorsOnlyDescription } from './description.js';
export { supportVectorsOnlyFacet } from './facet.js';
export { supportVectorsOnlyIRs } from './irs.js';
export { supportVectorsOnlyScene } from './scene.js';
export type {
  SupportVectorsOnlyScene,
  SvoPoint,
  SvoSolution,
  SvoStep,
} from './scene.js';
export { supportVectorsOnlyStageView } from './support-vectors-only-stage.js';

export function registerSupportVectorsOnly(): void {
  registerAlgorithm('supportVectorsOnly', supportVectorsOnlyAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('supportVectorsOnlyScene', supportVectorsOnlyScene);
  for (const ir of supportVectorsOnlyIRs) registerIR(ir.id, ir);
  registerView('support-vectors-only-stage', supportVectorsOnlyStageView);
  registerFacets([supportVectorsOnlyFacet]);
  registerDescription(supportVectorsOnlyFacet.id, supportVectorsOnlyDescription);
}
