/**
 * Kafka 패턴 — 등록 진입점. 호출은 호스트의 몫이다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { kafkaPatternAlgorithm, type KafkaPatternData } from './algorithm.js';
import { kafkaPatternProjector } from './projector.js';
import { kafkaPatternIRs } from './irs.js';
import { kafkaPatternStageView } from './kafka-pattern-stage.js';
import { kafkaPatternFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './kafka-pattern-stage.js';
export * from './facet.js';

export function registerKafkaPattern(): void {
  registerAlgorithm<KafkaPatternData>('kafkaPattern', kafkaPatternAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('kafkaPatternProjector', kafkaPatternProjector);
  for (const ir of kafkaPatternIRs) registerIR(ir.id, ir);
  registerView('kafka-pattern-stage', kafkaPatternStageView);
  registerFacets([kafkaPatternFacet]);
}
