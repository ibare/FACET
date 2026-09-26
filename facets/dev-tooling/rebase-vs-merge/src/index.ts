import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { rebaseVsMergeAlgorithm, type RebaseVsMergeData } from './algorithm.js';
import { rebaseVsMergeProjector } from './projector.js';
import { rebaseVsMergeIRs } from './irs.js';
import { rebaseVsMergeStageView } from './rebase-vs-merge-stage.js';
import { rebaseVsMergeFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './rebase-vs-merge-stage.js';
export * from './facet.js';

export function registerRebaseVsMerge(): void {
  registerAlgorithm<RebaseVsMergeData>('rebaseVsMerge', rebaseVsMergeAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('rebaseVsMergeProjector', rebaseVsMergeProjector);
  for (const ir of rebaseVsMergeIRs) registerIR(ir.id, ir);
  registerView('rebase-vs-merge-stage', rebaseVsMergeStageView);
  registerFacets([rebaseVsMergeFacet]);
}
