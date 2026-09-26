import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { consumerOffset, type ConsumerOffsetFacetData } from './algorithm.js';
import { consumerOffsetScene } from './scene.js';
import { consumerOffsetIRs } from './irs.js';
import { consumerOffsetStageView } from './consumer-offset-stage.js';
import { consumerOffsetFacet } from './facet.js';

export {
  consumerOffset,
  logCapacity,
  readConsumerOffsetData,
  type ConsumerEvent,
  type ConsumerGroup,
  type ConsumerOffsetFacetData,
} from './algorithm.js';
export { consumerOffsetScene, type ConsumerOffsetScene, type ConsumerOffsetStep } from './scene.js';
export { consumerOffsetIRs } from './irs.js';
export { consumerOffsetStageView } from './consumer-offset-stage.js';
export { consumerOffsetFacet } from './facet.js';

export function registerConsumerOffset(): void {
  registerAlgorithm<ConsumerOffsetFacetData>('consumerOffset', consumerOffset, { mechanismKind: 'reactive' });
  registerScenePlan('consumerOffsetScene', consumerOffsetScene);
  for (const ir of consumerOffsetIRs) registerIR(ir.id, ir);
  registerView('consumer-offset-stage', consumerOffsetStageView);
  registerFacets([consumerOffsetFacet]);
}
