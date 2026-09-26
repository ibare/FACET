import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { oneBatchAtATime, type OneBatchAtATimeFacetData } from './algorithm.js';
import { oneBatchAtATimeFacet } from './facet.js';
import { oneBatchAtATimeIRs } from './irs.js';
import { oneBatchAtATimeStageView } from './one-batch-at-a-time-stage.js';
import { oneBatchAtATimeScene } from './scene.js';

export * from './algorithm.js';
export * from './scene.js';
export { oneBatchAtATimeStageView } from './one-batch-at-a-time-stage.js';
export { oneBatchAtATimeIRs } from './irs.js';
export { oneBatchAtATimeFacet } from './facet.js';

export function registerOneBatchAtATime(): void {
  registerAlgorithm<OneBatchAtATimeFacetData>('oneBatchAtATime', oneBatchAtATime, { mechanismKind: 'reactive' });
  registerScenePlan('oneBatchAtATimeScene', oneBatchAtATimeScene);
  for (const ir of oneBatchAtATimeIRs) registerIR(ir.id, ir);
  registerView('one-batch-at-a-time-stage', oneBatchAtATimeStageView);
  registerFacets([oneBatchAtATimeFacet]);
}
