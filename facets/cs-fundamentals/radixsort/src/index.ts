export { radixsort, type RadixSortData } from './algorithm.js';
export { radixsortProjector } from './projector.js';
export { radixsortImperativeIR, radixsortIRs } from './irs.js';
export { radixsortFacet } from './facet.js';
export { radixsortDescription } from './description.js';

import {
  registerAlgorithm,
  registerProjector,
  registerFacets,
  registerIR,
  registerDescription,
} from '@facet/core/runtime';
import { radixsort } from './algorithm.js';
import { radixsortProjector } from './projector.js';
import { radixsortIRs } from './irs.js';
import { radixsortFacet } from './facet.js';
import { radixsortDescription } from './description.js';

export function registerRadixsort(): void {
  registerAlgorithm('radixsort', radixsort);
  registerProjector('radixsortProjector', radixsortProjector);
  for (const ir of radixsortIRs) registerIR(ir.id, ir);
  registerFacets([radixsortFacet]);
  registerDescription(radixsortFacet.id, radixsortDescription);
}
