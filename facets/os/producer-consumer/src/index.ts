import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { producerConsumerAlgorithm, type ProducerConsumerData } from './algorithm.js';
import { producerConsumerProjector } from './projector.js';
import { producerConsumerIRs } from './irs.js';
import { producerConsumerStageView } from './producer-consumer-stage.js';
import { producerConsumerFacet } from './facet.js';

export { producerConsumerAlgorithm, simulateRound, type ProducerConsumerData, type RoundResult, type TickRow } from './algorithm.js';
export { producerConsumerProjector } from './projector.js';
export { producerConsumerIRs } from './irs.js';
export { producerConsumerStageView, type ProducerConsumerStage } from './producer-consumer-stage.js';
export { producerConsumerFacet } from './facet.js';

export function registerProducerConsumer(): void {
  registerAlgorithm<ProducerConsumerData>('producerConsumer', producerConsumerAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('producerConsumerProjector', producerConsumerProjector);
  for (const ir of producerConsumerIRs) registerIR(ir.id, ir);
  registerView('producer-consumer-stage', producerConsumerStageView);
  registerFacets([producerConsumerFacet]);
}
