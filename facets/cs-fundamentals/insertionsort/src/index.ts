export { insertionsort, type InsertionSortData } from './algorithm.js';
export { insertionsortProjector } from './projector.js';
export { insertionsortImperativeIR, insertionsortIRs } from './irs.js';
export { insertionsortFacet } from './facet.js';
export { insertionsortDescription } from './description.js';

import {
  registerAlgorithm,
  registerProjector,
  registerFacets,
  registerIR,
  registerDescription,
} from '@facet/core/runtime';
import { insertionsort } from './algorithm.js';
import { insertionsortProjector } from './projector.js';
import { insertionsortIRs } from './irs.js';
import { insertionsortFacet } from './facet.js';
import { insertionsortDescription } from './description.js';

export function registerInsertionsort(): void {
  registerAlgorithm('insertionsort', insertionsort);
  registerProjector('insertionsortProjector', insertionsortProjector);
  for (const ir of insertionsortIRs) registerIR(ir.id, ir);
  registerFacets([insertionsortFacet]);
  registerDescription(insertionsortFacet.id, insertionsortDescription);
}
