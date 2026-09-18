import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';

import { topKTopPAlgorithm, type TopKTopPData } from './algorithm.js';
import { topKTopPProjector } from './projector.js';
import { topKTopPIRs } from './irs.js';
import { topKTopPStageView } from './top-k-top-p-stage.js';
import { topKTopPFacet } from './facet.js';

export {
  topKTopPAlgorithm,
  cutContext,
  roundPercent,
  frameOf,
  type TopKTopPData,
  type TopKTopPContextData,
  type ContextCut,
  type Cutter,
  type ContextFrame,
} from './algorithm.js';
export { topKTopPProjector } from './projector.js';
export { topKTopPImperativeIR, topKTopPIRs } from './irs.js';
export { topKTopPStageView, type TopKTopPStage } from './top-k-top-p-stage.js';
export { topKTopPFacet } from './facet.js';

export function registerTopKTopP(): void {
  registerAlgorithm<TopKTopPData>('topKTopP', topKTopPAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('topKTopPProjector', topKTopPProjector);
  for (const ir of topKTopPIRs) registerIR(ir.id, ir);
  registerView('top-k-top-p-stage', topKTopPStageView);
  registerFacets([topKTopPFacet]);
}
