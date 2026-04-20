export { countingsort, type CountingSortData } from './algorithm.js';
export { countingsortProjector } from './projector.js';
export { countingsortImperativeIR, countingsortIRs } from './irs.js';
export { countingsortFacet } from './facet.js';
export { countingsortDescription } from './description.js';

import {
  registerAlgorithm,
  registerProjector,
  registerFacets,
  registerIR,
  registerDescription,
} from '@facet/core/runtime';
import { countingsort } from './algorithm.js';
import { countingsortProjector } from './projector.js';
import { countingsortIRs } from './irs.js';
import { countingsortFacet } from './facet.js';
import { countingsortDescription } from './description.js';

export function registerCountingsort(): void {
  registerAlgorithm('countingsort', countingsort);
  registerProjector('countingsortProjector', countingsortProjector);
  for (const ir of countingsortIRs) registerIR(ir.id, ir);
  registerFacets([countingsortFacet]);
  registerDescription(countingsortFacet.id, countingsortDescription);
}
