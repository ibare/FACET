import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { fileBlockPlacementAlgorithm, type FileBlockPlacementData } from './algorithm.js';
import { fileBlockPlacementProjector } from './projector.js';
import { fileBlockPlacementIRs } from './irs.js';
import { fileBlockPlacementStageView } from './file-block-placement-stage.js';
import { fileBlockPlacementFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './file-block-placement-stage.js';
export * from './facet.js';

export function registerFileBlockPlacement(): void {
  registerAlgorithm<FileBlockPlacementData>('fileBlockPlacement', fileBlockPlacementAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('fileBlockPlacementProjector', fileBlockPlacementProjector);
  for (const ir of fileBlockPlacementIRs) registerIR(ir.id, ir);
  registerView('file-block-placement-stage', fileBlockPlacementStageView);
  registerFacets([fileBlockPlacementFacet]);
}
