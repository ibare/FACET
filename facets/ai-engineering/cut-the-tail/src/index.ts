import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { cutTheTail, type CutTheTailFacetData } from './algorithm.js';
import { cutTheTailScene } from './scene.js';
import { cutTheTailStageView } from './cut-the-tail-stage.js';
import { cutTheTailIRs } from './irs.js';
import { cutTheTailFacet } from './facet.js';

export { cutTheTail, type CutTheTailFacetData } from './algorithm.js';
export {
  cutTheTailScene,
  type CutTheTailScene,
  type CutTheTailBase,
  type CutTheTailCut,
  type CutTheTailRenorm,
  type CutTheTailDraw,
  type CutTheTailStep,
} from './scene.js';
export { cutTheTailStageView } from './cut-the-tail-stage.js';
export { cutTheTailIRs } from './irs.js';
export { cutTheTailFacet } from './facet.js';

export function registerCutTheTail(): void {
  registerAlgorithm<CutTheTailFacetData>('cutTheTail', cutTheTail, { mechanismKind: 'reactive' });
  registerScenePlan('cutTheTailScene', cutTheTailScene);
  for (const ir of cutTheTailIRs) registerIR(ir.id, ir);
  registerView('cut-the-tail-stage', cutTheTailStageView);
  registerFacets([cutTheTailFacet]);
}
