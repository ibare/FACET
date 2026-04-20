export { arraymax, type ArrayMaxData } from './algorithm.js';
export { arraymaxProjector } from './projector.js';
export { arraymaxImperativeIR, arraymaxIRs } from './irs.js';
export { arraymaxFacet } from './facet.js';
export { arraymaxDescription } from './description.js';

import {
  registerAlgorithm,
  registerProjector,
  registerFacets,
  registerIR,
  registerDescription,
} from '@facet/core/runtime';
import { arraymax, type ArrayMaxData } from './algorithm.js';
import { arraymaxProjector } from './projector.js';
import { arraymaxIRs } from './irs.js';
import { arraymaxFacet } from './facet.js';
import { arraymaxDescription } from './description.js';

export function registerArraymax(): void {
  registerAlgorithm<ArrayMaxData>('arraymax', async (ctx) => {
    await arraymax(ctx);
  });
  registerProjector('arraymaxProjector', arraymaxProjector);
  for (const ir of arraymaxIRs) registerIR(ir.id, ir);
  registerFacets([arraymaxFacet]);
  registerDescription(arraymaxFacet.id, arraymaxDescription);
}
