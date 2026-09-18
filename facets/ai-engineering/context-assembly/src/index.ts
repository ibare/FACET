import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { contextAssemblyAlgorithm, type ContextAssemblyData } from './algorithm.js';
import { contextAssemblyProjector } from './projector.js';
import { contextAssemblyIRs } from './irs.js';
import { contextAssemblyStageView } from './context-assembly-stage.js';
import { contextAssemblyFacet } from './facet.js';

export { contextAssemblyAlgorithm, wordCount, type ContextAssemblyData } from './algorithm.js';
export { contextAssemblyProjector } from './projector.js';
export { contextAssemblyImperativeIR, contextAssemblyIRs } from './irs.js';
export { contextAssemblyStageView, type ContextAssemblyStage } from './context-assembly-stage.js';
export { contextAssemblyFacet } from './facet.js';

export function registerContextAssembly(): void {
  registerAlgorithm<ContextAssemblyData>('contextAssembly', contextAssemblyAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('contextAssemblyProjector', contextAssemblyProjector);
  for (const ir of contextAssemblyIRs) registerIR(ir.id, ir);
  registerView('context-assembly-stage', contextAssemblyStageView);
  registerFacets([contextAssemblyFacet]);
}
