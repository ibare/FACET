import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { sequenceNumber, type SequenceNumberFacetData } from './algorithm.js';
import { sequenceNumberScene } from './scene.js';
import { sequenceNumberIRs } from './irs.js';
import { sequenceNumberStageView } from './sequence-number-stage.js';
import { sequenceNumberFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './sequence-number-stage.js';
export * from './facet.js';

export function registerSequenceNumber(): void {
  registerAlgorithm<SequenceNumberFacetData>('sequenceNumber', sequenceNumber, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('sequenceNumberScene', sequenceNumberScene);
  for (const ir of sequenceNumberIRs) registerIR(ir.id, ir);
  registerView('sequence-number-stage', sequenceNumberStageView);
  registerFacets([sequenceNumberFacet]);
}
