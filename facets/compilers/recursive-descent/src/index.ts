import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { recursiveDescentAlgorithm, type RecursiveDescentData } from './algorithm.js';
import { recursiveDescentFacet } from './facet.js';
import { recursiveDescentIRs } from './irs.js';
import { recursiveDescentProjector } from './projector.js';
import { recursiveDescentStageView } from './recursive-descent-stage.js';

export * from './algorithm.js';
export * from './facet.js';
export * from './irs.js';
export * from './projector.js';
export * from './recursive-descent-stage.js';

export function registerRecursiveDescent(): void {
  registerAlgorithm<RecursiveDescentData>('recursiveDescent', recursiveDescentAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('recursiveDescentProjector', recursiveDescentProjector);
  for (const ir of recursiveDescentIRs) registerIR(ir.id, ir);
  registerView('recursive-descent-stage', recursiveDescentStageView);
  registerFacets([recursiveDescentFacet]);
}
