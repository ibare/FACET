/**
 * @ffacet/algorithm-beam-search — 빔 서치 완제품.
 *
 * `registerBeamSearch()` 는 호스트가 부른다. 이 모듈은 스스로 등록하지 않는다.
 */

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { beamSearchAlgorithm, type BeamSearchData } from './algorithm.js';
import { beamSearchProjector } from './projector.js';
import { beamSearchIRs } from './irs.js';
import { beamSearchStageView } from './beam-search-stage.js';
import { beamSearchFacet } from './facet.js';

export {
  beamSearchAlgorithm,
  encodeBeamTables,
  runBeamSearch,
  toPermille,
  BEAM_ROW_SLOTS,
} from './algorithm.js';
export type {
  BeamSearchData,
  BeamSearchRow,
  BeamSearchTables,
  BeamRun,
  BeamLayer,
  BeamBranch,
  BeamCandidate,
} from './algorithm.js';
export { beamSearchProjector } from './projector.js';
export { beamSearchImperativeIR, beamSearchIRs } from './irs.js';
export { beamSearchStageView, formatScore } from './beam-search-stage.js';
export type { BeamSearchStage } from './beam-search-stage.js';
export { beamSearchFacet } from './facet.js';

export function registerBeamSearch(): void {
  registerAlgorithm<BeamSearchData>('beamSearch', beamSearchAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('beamSearchProjector', beamSearchProjector);
  for (const ir of beamSearchIRs) registerIR(ir.id, ir);
  registerView('beam-search-stage', beamSearchStageView);
  registerFacets([beamSearchFacet]);
}
