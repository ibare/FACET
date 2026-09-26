import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { splitBrain, type SplitBrainFacetData } from './algorithm.js';
import { splitBrainScene } from './scene.js';
import { splitBrainStageView } from './split-brain-stage.js';
import { splitBrainIRs } from './irs.js';
import { splitBrainFacet } from './facet.js';

export { splitBrain, type SplitBrainFacetData, type SplitBrainEntry } from './algorithm.js';
export { splitBrainScene, type SplitBrainScene } from './scene.js';
export { splitBrainStageView } from './split-brain-stage.js';
export { splitBrainIRs } from './irs.js';
export { splitBrainFacet } from './facet.js';

export function registerSplitBrain(): void {
  registerAlgorithm<SplitBrainFacetData>('splitBrain', splitBrain, { mechanismKind: 'reactive' });
  registerScenePlan('splitBrainScene', splitBrainScene);
  for (const ir of splitBrainIRs) registerIR(ir.id, ir);
  registerView('split-brain-stage', splitBrainStageView);
  registerFacets([splitBrainFacet]);
}
