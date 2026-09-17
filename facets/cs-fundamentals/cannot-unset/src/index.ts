/**
 * cannot-unset 등록 진입점.
 *
 * 부르는 책임은 호스트 앱에 있다 — 이 모듈은 사이드 이펙트로 스스로 등록하지 않는다.
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { cannotUnsetAlgorithm, type CannotUnsetData } from './algorithm.js';
import { cannotUnsetScene } from './scene.js';
import { cannotUnsetIRs } from './irs.js';
import { cannotUnsetStageView } from './cannot-unset-stage.js';
import { cannotUnsetFacet } from './facet.js';
import { cannotUnsetDescription } from './description.js';

export { cannotUnsetAlgorithm } from './algorithm.js';
export type { CannotUnsetData, CannotUnsetWord } from './algorithm.js';
export {
  cannotUnsetScene,
  type CannotUnsetPhase,
  type CannotUnsetScene,
  type WordStand,
} from './scene.js';
export { cannotUnsetIRs } from './irs.js';
export { cannotUnsetStageView } from './cannot-unset-stage.js';
export { cannotUnsetFacet } from './facet.js';
export { cannotUnsetDescription } from './description.js';

export function registerCannotUnset(): void {
  registerAlgorithm<CannotUnsetData>('cannotUnset', cannotUnsetAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('cannotUnsetScene', cannotUnsetScene);
  for (const ir of cannotUnsetIRs) registerIR(ir.id, ir);
  registerView('cannot-unset-stage', cannotUnsetStageView);
  registerFacets([cannotUnsetFacet]);
  registerDescription(cannotUnsetFacet.id, cannotUnsetDescription);
}
