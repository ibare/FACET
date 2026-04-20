export { shellsort, type ShellSortData } from './algorithm.js';
export { shellsortProjector } from './projector.js';
export { shellsortImperativeIR, shellsortIRs } from './irs.js';
export { shellsortFacet } from './facet.js';
export { shellsortDescription } from './description.js';

import {
  registerAlgorithm,
  registerProjector,
  registerFacets,
  registerIR,
  registerDescription,
} from '@facet/core/runtime';
import { shellsort } from './algorithm.js';
import { shellsortProjector } from './projector.js';
import { shellsortIRs } from './irs.js';
import { shellsortFacet } from './facet.js';
import { shellsortDescription } from './description.js';

export function registerShellsort(): void {
  registerAlgorithm('shellsort', shellsort);
  registerProjector('shellsortProjector', shellsortProjector);
  for (const ir of shellsortIRs) registerIR(ir.id, ir);
  registerFacets([shellsortFacet]);
  registerDescription(shellsortFacet.id, shellsortDescription);
}
