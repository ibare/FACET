/**
 * instruction-selection — 명령 선택 완제품. 등록은 registerInstructionSelection() 하나로.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { instructionSelectionAlgorithm, type InstructionSelectionData } from './algorithm.js';
import { instructionSelectionProjector } from './projector.js';
import { instructionSelectionIRs } from './irs.js';
import { instructionSelectionStageView } from './instruction-selection-stage.js';
import { instructionSelectionFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './instruction-selection-stage.js';
export * from './facet.js';

export function registerInstructionSelection(): void {
  registerAlgorithm<InstructionSelectionData>('instructionSelection', instructionSelectionAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('instructionSelectionProjector', instructionSelectionProjector);
  for (const ir of instructionSelectionIRs) registerIR(ir.id, ir);
  registerView('instruction-selection-stage', instructionSelectionStageView);
  registerFacets([instructionSelectionFacet]);
}
