export { mergesort, type MergeSortData } from './algorithm.js';
export { mergesortProjector } from './projector.js';
export { mergesortImperativeIR, mergesortIRs } from './irs.js';
export { mergesortFacet } from './facet.js';
export { mergesortDescription } from './description.js';

import {
  registerAlgorithm,
  registerProjector,
  registerFacets,
  registerIR,
  registerDescription,
} from '@facet/core/runtime';
import { mergesort } from './algorithm.js';
import { mergesortProjector } from './projector.js';
import { mergesortIRs } from './irs.js';
import { mergesortFacet } from './facet.js';
import { mergesortDescription } from './description.js';

export function registerMergesort(): void {
  registerAlgorithm('mergesort', mergesort);
  registerProjector('mergesortProjector', mergesortProjector);
  for (const ir of mergesortIRs) registerIR(ir.id, ir);
  registerFacets([mergesortFacet]);
  registerDescription(mergesortFacet.id, mergesortDescription);
}
