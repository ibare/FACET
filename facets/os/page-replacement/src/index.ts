import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { pageReplacementAlgorithm, type PageReplacementData } from './algorithm.js';
import { pageReplacementFacet } from './facet.js';
import { pageReplacementIRs } from './irs.js';
import { pageReplacementStageView } from './page-replacement-stage.js';
import { pageReplacementProjector } from './projector.js';

export { countFaults, pageReplacementAlgorithm, type PageReplacementData, type PageStep } from './algorithm.js';
export { pageReplacementProjector } from './projector.js';
export { pageReplacementImperativeIR, pageReplacementIRs } from './irs.js';
export { pageReplacementStageView, type PageReplacementStage, type StageRound, type StageStep } from './page-replacement-stage.js';
export { pageReplacementFacet } from './facet.js';

export function registerPageReplacement(): void {
  registerAlgorithm<PageReplacementData>('pageReplacement', pageReplacementAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('pageReplacementProjector', pageReplacementProjector);
  for (const ir of pageReplacementIRs) registerIR(ir.id, ir);
  registerView('page-replacement-stage', pageReplacementStageView);
  registerFacets([pageReplacementFacet]);
}
