import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { receptiveFieldAlgorithm, type ReceptiveFieldData } from './algorithm.js';
import { receptiveFieldProjector } from './projector.js';
import { receptiveFieldIRs } from './irs.js';
import { receptiveFieldStageView } from './receptive-field-stage.js';
import { receptiveFieldFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './receptive-field-stage.js';
export * from './facet.js';

export function registerReceptiveField(): void {
  registerAlgorithm<ReceptiveFieldData>('receptiveField', receptiveFieldAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('receptiveFieldProjector', receptiveFieldProjector);
  for (const ir of receptiveFieldIRs) registerIR(ir.id, ir);
  registerView('receptive-field-stage', receptiveFieldStageView);
  registerFacets([receptiveFieldFacet]);
}
