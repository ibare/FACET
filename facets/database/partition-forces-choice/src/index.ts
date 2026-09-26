import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { partitionForcesChoice, type PartitionForcesChoiceFacetData } from './algorithm.js';
import { partitionForcesChoiceScene } from './scene.js';
import { partitionForcesChoiceStageView } from './partition-forces-choice-stage.js';
import { partitionForcesChoiceIRs } from './irs.js';
import { partitionForcesChoiceFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './partition-forces-choice-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerPartitionForcesChoice(): void {
  registerAlgorithm<PartitionForcesChoiceFacetData>('partitionForcesChoice', partitionForcesChoice, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('partitionForcesChoiceScene', partitionForcesChoiceScene);
  for (const ir of partitionForcesChoiceIRs) registerIR(ir.id, ir);
  registerView('partition-forces-choice-stage', partitionForcesChoiceStageView);
  registerFacets([partitionForcesChoiceFacet]);
}
