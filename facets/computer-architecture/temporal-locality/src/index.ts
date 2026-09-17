/**
 * temporal-locality 조각의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 등록하지 않는다 — 부르는 책임은 호스트 앱에 있다
 * (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { temporalLocalityAlgorithm, type TemporalLocalityData } from './algorithm.js';
import { temporalLocalityFacet } from './facet.js';
import { temporalLocalityIRs } from './irs.js';
import { temporalLocalityScene } from './scene.js';
import { temporalLocalityStageView } from './temporal-locality-stage.js';

export {
  temporalLocalityAlgorithm,
  computeTemporalLocalityTrace,
  temporalLocalityLineOf,
  type TemporalLocalityData,
  type TemporalLocalityAccess,
  type TemporalLocalityStream,
} from './algorithm.js';
export { temporalLocalityFacet } from './facet.js';
export { temporalLocalityIRs } from './irs.js';
export {
  temporalLocalityScene,
  type TemporalLocalityScene,
  type TemporalLocalityRead,
  type TemporalLocalitySceneStep,
} from './scene.js';
export { temporalLocalityStageView } from './temporal-locality-stage.js';

export function registerTemporalLocality(): void {
  registerAlgorithm<TemporalLocalityData>('temporalLocality', temporalLocalityAlgorithm, {
    mechanismKind: 'reactive',
  });
  // 장면 설계의 이름은 algorithm 이름과 겹치지 않는다 (C4).
  registerScenePlan('temporalLocalityScene', temporalLocalityScene);
  for (const ir of temporalLocalityIRs) registerIR(ir.id, ir);
  registerView('temporal-locality-stage', temporalLocalityStageView);
  registerFacets([temporalLocalityFacet]);
}
