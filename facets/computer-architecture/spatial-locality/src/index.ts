/**
 * 등록 진입점. 호출 책임은 호스트 앱에 있다 — 이 파일은 사이드 이펙트로
 * 스스로 등록하지 않는다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { spatialLocalityAlgorithm } from './algorithm.js';
import type { SpatialLocalityData } from './algorithm.js';
import { spatialLocalityProjector } from './projector.js';
import { spatialLocalityIRs } from './irs.js';
import { spatialLocalityStageView } from './spatial-locality-stage.js';
import { spatialLocalityFacet } from './facet.js';
import { spatialLocalityDescription } from './description.js';

export { spatialLocalityAlgorithm } from './algorithm.js';
export type { SpatialLocalityData } from './algorithm.js';
export { spatialLocalityProjector } from './projector.js';
export { spatialLocalityIRs } from './irs.js';
export { spatialLocalityStageView } from './spatial-locality-stage.js';
export { spatialLocalityFacet } from './facet.js';
export { spatialLocalityDescription } from './description.js';

export function registerSpatialLocality(): void {
  // 등록 이름은 algorithm 과 projector 가 갈려야 한다 — 같으면 `module:` 참조만
  // 보고 어느 쪽인지 알 수 없다 (C4).
  registerAlgorithm<SpatialLocalityData>('spatialLocality', spatialLocalityAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('spatialLocalityProjector', spatialLocalityProjector);
  for (const ir of spatialLocalityIRs) registerIR(ir.id, ir);
  registerView('spatial-locality-stage', spatialLocalityStageView);
  registerFacets([spatialLocalityFacet]);
  registerDescription(spatialLocalityFacet.id, spatialLocalityDescription);
}
