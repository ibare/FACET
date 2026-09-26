import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { patternToInstruction } from './algorithm.js';
import type { PatternToInstructionFacetData } from './algorithm.js';
import { patternToInstructionScene } from './scene.js';
import { patternToInstructionStageView } from './pattern-to-instruction-stage.js';
import { patternToInstructionIRs } from './irs.js';
import { patternToInstructionFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { patternToInstructionStageView } from './pattern-to-instruction-stage.js';
export { patternToInstructionIRs } from './irs.js';
export { patternToInstructionFacet } from './facet.js';

export function registerPatternToInstruction(): void {
  registerAlgorithm<PatternToInstructionFacetData>('patternToInstruction', patternToInstruction, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('patternToInstructionScene', patternToInstructionScene);
  for (const ir of patternToInstructionIRs) registerIR(ir.id, ir);
  registerView('pattern-to-instruction-stage', patternToInstructionStageView);
  registerFacets([patternToInstructionFacet]);
}
