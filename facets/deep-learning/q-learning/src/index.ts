/**
 * Q-러닝과 탐험 — 등록 진입점. 호스트가 registerQLearning() 을 부른다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { qLearningAlgorithm, type QLearningData } from './algorithm.js';
import { qLearningProjector } from './projector.js';
import { qLearningIRs } from './irs.js';
import { qLearningStageView } from './q-learning-stage.js';
import { qLearningFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './q-learning-stage.js';
export * from './facet.js';

export function registerQLearning(): void {
  registerAlgorithm<QLearningData>('qLearning', qLearningAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('qLearningProjector', qLearningProjector);
  for (const ir of qLearningIRs) registerIR(ir.id, ir);
  registerView('q-learning-stage', qLearningStageView);
  registerFacets([qLearningFacet]);
}
