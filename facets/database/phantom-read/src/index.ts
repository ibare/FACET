import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { phantomRead, type PhantomReadFacetData } from './algorithm.js';
import { phantomReadScene } from './scene.js';
import { phantomReadIRs } from './irs.js';
import { phantomReadStageView } from './phantom-read-stage.js';
import { phantomReadFacet } from './facet.js';

export { phantomRead, type PhantomReadFacetData, type PhantomReadStatement } from './algorithm.js';
export { phantomReadScene, type PhantomReadScene } from './scene.js';
export { phantomReadIRs } from './irs.js';
export { phantomReadStageView } from './phantom-read-stage.js';
export { phantomReadFacet } from './facet.js';

export function registerPhantomRead(): void {
  registerAlgorithm<PhantomReadFacetData>('phantomRead', phantomRead, { mechanismKind: 'reactive' });
  registerScenePlan('phantomReadScene', phantomReadScene);
  for (const ir of phantomReadIRs) registerIR(ir.id, ir);
  registerView('phantom-read-stage', phantomReadStageView);
  registerFacets([phantomReadFacet]);
}
