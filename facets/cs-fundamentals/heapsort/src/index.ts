export { heapsort, type HeapSortData } from './algorithm.js';
export { heapsortProjector } from './projector.js';
export { heapsortImperativeIR, heapsortIRs } from './irs.js';
export { heapsortFacet } from './facet.js';
export { heapsortDescription } from './description.js';

import {
  registerAlgorithm,
  registerProjector,
  registerFacets,
  registerIR,
  registerDescription,
} from '@facet/core/runtime';
import { heapsort } from './algorithm.js';
import { heapsortProjector } from './projector.js';
import { heapsortIRs } from './irs.js';
import { heapsortFacet } from './facet.js';
import { heapsortDescription } from './description.js';

export function registerHeapsort(): void {
  registerAlgorithm('heapsort', heapsort);
  registerProjector('heapsortProjector', heapsortProjector);
  for (const ir of heapsortIRs) registerIR(ir.id, ir);
  registerFacets([heapsortFacet]);
  registerDescription(heapsortFacet.id, heapsortDescription);
}
