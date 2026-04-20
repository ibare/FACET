export { interpolationsearch, type InterpolationSearchData } from './algorithm.js';
export { interpolationsearchProjector } from './projector.js';
export { interpolationsearchImperativeIR, interpolationsearchIRs } from './irs.js';
export { interpolationsearchFacet } from './facet.js';
export { interpolationsearchDescription } from './description.js';

import {
  registerAlgorithm,
  registerProjector,
  registerFacets,
  registerIR,
  registerDescription,
} from '@facet/core/runtime';
import { interpolationsearch, type InterpolationSearchData } from './algorithm.js';
import { interpolationsearchProjector } from './projector.js';
import { interpolationsearchIRs } from './irs.js';
import { interpolationsearchFacet } from './facet.js';
import { interpolationsearchDescription } from './description.js';

export function registerInterpolationsearch(): void {
  registerAlgorithm<InterpolationSearchData>('interpolationsearch', async (ctx) => {
    await interpolationsearch(ctx);
  });
  registerProjector('interpolationsearchProjector', interpolationsearchProjector);
  for (const ir of interpolationsearchIRs) registerIR(ir.id, ir);
  registerFacets([interpolationsearchFacet]);
  registerDescription(interpolationsearchFacet.id, interpolationsearchDescription);
}
