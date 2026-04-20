export { selectionsort, type SelectionSortData } from './algorithm.js';
export { selectionsortProjector } from './projector.js';
export { selectionsortImperativeIR, selectionsortIRs } from './irs.js';
export { selectionsortFacet } from './facet.js';
export { selectionsortDescription } from './description.js';

import {
  registerAlgorithm,
  registerProjector,
  registerFacets,
  registerIR,
  registerDescription,
} from '@facet/core/runtime';
import { selectionsort } from './algorithm.js';
import { selectionsortProjector } from './projector.js';
import { selectionsortIRs } from './irs.js';
import { selectionsortFacet } from './facet.js';
import { selectionsortDescription } from './description.js';

export function registerSelectionsort(): void {
  registerAlgorithm('selectionsort', selectionsort);
  registerProjector('selectionsortProjector', selectionsortProjector);
  for (const ir of selectionsortIRs) registerIR(ir.id, ir);
  registerFacets([selectionsortFacet]);
  registerDescription(selectionsortFacet.id, selectionsortDescription);
}
