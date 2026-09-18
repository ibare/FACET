import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { staticPredictionAlgorithm } from './algorithm.js';
import { staticPredictionProjector } from './projector.js';
import { staticPredictionIRs } from './irs.js';
import { staticPredictionStageView } from './static-prediction-stage.js';
import { staticPredictionFacet } from './facet.js';

export {
  staticPredictionAlgorithm,
  computeStaticPrediction,
  guessOf,
  hitPercentOf,
} from './algorithm.js';
export type { StaticPredictionData, StaticPredictionResult } from './algorithm.js';
export { staticPredictionProjector } from './projector.js';
export { staticPredictionImperativeIR, staticPredictionIRs } from './irs.js';
export { staticPredictionStageView } from './static-prediction-stage.js';
export type { StaticPredictionStage } from './static-prediction-stage.js';
export { staticPredictionFacet } from './facet.js';

export function registerStaticPrediction(): void {
  registerAlgorithm('staticPrediction', staticPredictionAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('staticPredictionProjector', staticPredictionProjector);
  for (const ir of staticPredictionIRs) registerIR(ir.id, ir);
  registerView('static-prediction-stage', staticPredictionStageView);
  registerFacets([staticPredictionFacet]);
}
