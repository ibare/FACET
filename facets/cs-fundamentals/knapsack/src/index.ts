export { knapsack, type KnapsackData, type KnapsackResult } from './algorithm.js';
export { knapsackProjector } from './projector.js';
export { knapsackImperativeIR, knapsackIRs } from './irs.js';
export { knapsackFacet } from './facet.js';
export { knapsackDescription } from './description.js';

import {
  registerAlgorithm,
  registerProjector,
  registerFacets,
  registerIR,
  registerDescription,
} from '@facet/core/runtime';
import { knapsack, type KnapsackData } from './algorithm.js';
import { knapsackProjector } from './projector.js';
import { knapsackIRs } from './irs.js';
import { knapsackFacet } from './facet.js';
import { knapsackDescription } from './description.js';

export function registerKnapsack(): void {
  registerAlgorithm<KnapsackData>('knapsack', async (ctx) => {
    await knapsack(ctx);
  });
  registerProjector('knapsackProjector', knapsackProjector);
  for (const ir of knapsackIRs) registerIR(ir.id, ir);
  registerFacets([knapsackFacet]);
  registerDescription(knapsackFacet.id, knapsackDescription);
}
