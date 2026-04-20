export { subsetsum, type SubsetSumData } from './algorithm.js';
export { subsetsumProjector } from './projector.js';
export { subsetsumImperativeIR, subsetsumIRs } from './irs.js';
export { subsetsumFacet } from './facet.js';
export { subsetsumDescription } from './description.js';

import {
  registerAlgorithm,
  registerProjector,
  registerFacets,
  registerIR,
  registerDescription,
} from '@facet/core/runtime';
import { subsetsum, type SubsetSumData } from './algorithm.js';
import { subsetsumProjector } from './projector.js';
import { subsetsumIRs } from './irs.js';
import { subsetsumFacet } from './facet.js';
import { subsetsumDescription } from './description.js';

export function registerSubsetsum(): void {
  registerAlgorithm<SubsetSumData>('subsetsum', async (ctx) => {
    await subsetsum(ctx);
  });
  registerProjector('subsetsumProjector', subsetsumProjector);
  for (const ir of subsetsumIRs) registerIR(ir.id, ir);
  registerFacets([subsetsumFacet]);
  registerDescription(subsetsumFacet.id, subsetsumDescription);
}
