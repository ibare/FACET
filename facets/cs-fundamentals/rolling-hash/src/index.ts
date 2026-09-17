/**
 * 굴러가는 해시 조각의 등록 진입점.
 *
 * 부수효과로 스스로 등록하지 않는다 — 호출 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { rollingHashAlgorithm, type RollingHashData } from './algorithm.js';
import { rollingHashScene } from './scene.js';
import { rollingHashIRs } from './irs.js';
import { rollingHashStageView } from './rolling-hash-stage.js';
import { rollingHashFacet } from './facet.js';
import { rollingHashDescription } from './description.js';

export function registerRollingHash(): void {
  // 조각은 마운트하자마자 스스로 시작하고 걸음 간격을 스스로 정해야 하는데,
  // 둘 다 reactive 만 준다 (S-piece).
  registerAlgorithm<RollingHashData>('rollingHash', rollingHashAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('rollingHashScene', rollingHashScene);
  for (const ir of rollingHashIRs) registerIR(ir.id, ir);
  registerView('rolling-hash-stage', rollingHashStageView);
  registerFacets([rollingHashFacet]);
  registerDescription(rollingHashFacet.id, rollingHashDescription);
}

export { rollingHashAlgorithm, hashOf, type RollingHashData } from './algorithm.js';
export { rollingHashScene } from './scene.js';
export type {
  RollingHashCaption,
  RollingHashMark,
  RollingHashScene,
  RollingHashStep,
  RollTerms,
} from './scene.js';
export { rollingHashIRs } from './irs.js';
export { rollingHashStageView } from './rolling-hash-stage.js';
export { rollingHashFacet } from './facet.js';
export { rollingHashDescription } from './description.js';
