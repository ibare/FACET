import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { ioTransferModesAlgorithm, type IoTransferModesData } from './algorithm.js';
import { ioTransferModesProjector } from './projector.js';
import { ioTransferModesIRs } from './irs.js';
import { ioTransferModesStageView } from './io-transfer-modes-stage.js';
import { ioTransferModesFacet } from './facet.js';

export * from './algorithm.js';
export { ioTransferModesProjector } from './projector.js';
export { ioTransferModesIRs } from './irs.js';
export { ioTransferModesStageView, type IoTransferModesStage } from './io-transfer-modes-stage.js';
export { ioTransferModesFacet } from './facet.js';

export function registerIoTransferModes(): void {
  registerAlgorithm<IoTransferModesData>('ioTransferModes', ioTransferModesAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('ioTransferModesProjector', ioTransferModesProjector);
  for (const ir of ioTransferModesIRs) registerIR(ir.id, ir);
  registerView('io-transfer-modes-stage', ioTransferModesStageView);
  registerFacets([ioTransferModesFacet]);
}
