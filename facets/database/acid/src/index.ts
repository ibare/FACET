import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { acidAlgorithm, type AcidData } from './algorithm.js';
import { acidProjector } from './projector.js';
import { acidIRs } from './irs.js';
import { acidStageView } from './acid-stage.js';
import { acidFacet } from './facet.js';

export { acidAlgorithm, type AcidData, type AcidTransfer } from './algorithm.js';
export { acidProjector } from './projector.js';
export { acidImperativeIR, acidIRs } from './irs.js';
export { acidStageView, type AcidStage } from './acid-stage.js';
export { acidFacet } from './facet.js';

/** acid facet 을 레지스트리에 올린다. 손잡이가 있으니 reactive. */
export function registerAcid(): void {
  registerAlgorithm<AcidData>('acid', acidAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('acidProjector', acidProjector);
  for (const ir of acidIRs) registerIR(ir.id, ir);
  registerView('acid-stage', acidStageView);
  registerFacets([acidFacet]);
}
