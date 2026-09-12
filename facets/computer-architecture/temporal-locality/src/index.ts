/**
 * temporal-locality 조각의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 등록하지 않는다 — 부르는 책임은 호스트 앱에 있다
 * (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { temporalLocalityAlgorithm, type TemporalLocalityData } from './algorithm.js';
import { temporalLocalityDescription } from './description.js';
import { temporalLocalityFacet } from './facet.js';
import { temporalLocalityIRs } from './irs.js';
import { temporalLocalityProjector } from './projector.js';
import { temporalLocalityStageView } from './temporal-locality-stage.js';

export {
  temporalLocalityAlgorithm,
  computeTemporalLocalityTrace,
  type TemporalLocalityData,
  type TemporalLocalityAccess,
  type TemporalLocalityStream,
} from './algorithm.js';
export { temporalLocalityDescription } from './description.js';
export { temporalLocalityFacet } from './facet.js';
export { temporalLocalityIRs } from './irs.js';
export { temporalLocalityProjector } from './projector.js';
export { temporalLocalityStageView } from './temporal-locality-stage.js';

export function registerTemporalLocality(): void {
  registerAlgorithm<TemporalLocalityData>('temporalLocality', temporalLocalityAlgorithm, {
    mechanismKind: 'reactive',
  });
  // projector 이름은 algorithm 이름과 겹치지 않는다 (C4).
  registerProjector('temporalLocalityProjector', temporalLocalityProjector);
  for (const ir of temporalLocalityIRs) registerIR(ir.id, ir);
  registerView('temporal-locality-stage', temporalLocalityStageView);
  registerFacets([temporalLocalityFacet]);
  registerDescription(temporalLocalityFacet.id, temporalLocalityDescription);
}
