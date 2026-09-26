/**
 * 퍼셉트론 — 끝나는가. 등록은 호스트가 `registerPerceptron()` 을 불러 한다.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { perceptronAlgorithm, type PerceptronData } from './algorithm.js';
import { perceptronFacet } from './facet.js';
import { perceptronIRs } from './irs.js';
import { perceptronStageView } from './perceptron-stage.js';
import { perceptronProjector } from './projector.js';

export * from './algorithm.js';
export * from './facet.js';
export * from './irs.js';
export * from './perceptron-stage.js';
export * from './projector.js';

export function registerPerceptron(): void {
  registerAlgorithm<PerceptronData>('perceptron', perceptronAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('perceptronProjector', perceptronProjector);
  for (const ir of perceptronIRs) registerIR(ir.id, ir);
  registerView('perceptron-stage', perceptronStageView);
  registerFacets([perceptronFacet]);
}
