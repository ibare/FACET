/**
 * 등록 진입점. 호출 책임은 호스트 앱에 있다 — 이 파일은 사이드 이펙트로
 * 스스로 등록하지 않는다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { spatialLocalityAlgorithm } from './algorithm.js';
import type { SpatialLocalityData } from './algorithm.js';
import { spatialLocalityScene } from './scene.js';
import { spatialLocalityIRs } from './irs.js';
import { spatialLocalityStageView } from './spatial-locality-stage.js';
import { spatialLocalityFacet } from './facet.js';

export {
  spatialLocalityAlgorithm,
  addrOf,
  cellCountOf,
  lineOf,
  readSpatialLocality,
  spanOf,
} from './algorithm.js';
export type { SpatialLocalityData, SpatialLocalityShape } from './algorithm.js';
export { spatialLocalityScene, activeIndex, missCount } from './scene.js';
export type { SpatialLocalityScene, SpatialStep, TouchOutcome } from './scene.js';
export { spatialLocalityIRs } from './irs.js';
export { spatialLocalityStageView } from './spatial-locality-stage.js';
export { spatialLocalityFacet } from './facet.js';

export function registerSpatialLocality(): void {
  // 등록 이름은 algorithm 과 장면 설계가 갈려야 한다 — 같으면 `module:` 참조만
  // 보고 어느 쪽인지 알 수 없다 (C4).
  registerAlgorithm<SpatialLocalityData>('spatialLocality', spatialLocalityAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('spatialLocalityScene', spatialLocalityScene);
  for (const ir of spatialLocalityIRs) registerIR(ir.id, ir);
  registerView('spatial-locality-stage', spatialLocalityStageView);
  registerFacets([spatialLocalityFacet]);
}
