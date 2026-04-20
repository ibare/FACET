export { linearsearch, type LinearSearchData } from './algorithm.js';
export { linearsearchProjector } from './projector.js';
export { linearsearchImperativeIR, linearsearchIRs } from './irs.js';
export { linearsearchFacet } from './facet.js';
export { linearsearchDescription } from './description.js';

import {
  registerAlgorithm,
  registerProjector,
  registerFacets,
  registerIR,
  registerDescription,
} from '@facet/core/runtime';
import { linearsearch, type LinearSearchData } from './algorithm.js';
import { linearsearchProjector } from './projector.js';
import { linearsearchIRs } from './irs.js';
import { linearsearchFacet } from './facet.js';
import { linearsearchDescription } from './description.js';

export function registerLinearsearch(): void {
  registerAlgorithm<LinearSearchData>('linearsearch', async (ctx) => {
    await linearsearch(ctx);
  });
  registerProjector('linearsearchProjector', linearsearchProjector);
  for (const ir of linearsearchIRs) registerIR(ir.id, ir);
  registerFacets([linearsearchFacet]);
  registerDescription(linearsearchFacet.id, linearsearchDescription);
}
