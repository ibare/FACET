/**
 * incremental-build — 증분 빌드 완제품. 등록은 호스트가 registerIncrementalBuild() 로 한다.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { incrementalBuildAlgorithm, type IncrementalBuildData } from './algorithm.js';
import { incrementalBuildProjector } from './projector.js';
import { incrementalBuildIRs } from './irs.js';
import { incrementalBuildStageView } from './incremental-build-stage.js';
import { incrementalBuildFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './incremental-build-stage.js';
export * from './facet.js';

export function registerIncrementalBuild(): void {
  registerAlgorithm<IncrementalBuildData>('incrementalBuild', incrementalBuildAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('incrementalBuildProjector', incrementalBuildProjector);
  for (const ir of incrementalBuildIRs) registerIR(ir.id, ir);
  registerView('incremental-build-stage', incrementalBuildStageView);
  registerFacets([incrementalBuildFacet]);
}
