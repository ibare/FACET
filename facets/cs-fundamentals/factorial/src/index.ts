export { factorial, type FactorialData } from './algorithm.js';
export { factorialProjector } from './projector.js';
export { factorialImperativeIR, factorialIRs } from './irs.js';
export { factorialFacet } from './facet.js';
export { factorialDescription } from './description.js';

import {
  registerAlgorithm,
  registerProjector,
  registerFacets,
  registerIR,
  registerDescription,
} from '@facet/core/runtime';
import { factorial, type FactorialData } from './algorithm.js';
import { factorialProjector } from './projector.js';
import { factorialIRs } from './irs.js';
import { factorialFacet } from './facet.js';
import { factorialDescription } from './description.js';

export function registerFactorial(): void {
  registerAlgorithm<FactorialData>('factorial', async (ctx) => {
    await factorial(ctx);
  });
  registerProjector('factorialProjector', factorialProjector);
  for (const ir of factorialIRs) registerIR(ir.id, ir);
  registerFacets([factorialFacet]);
  registerDescription(factorialFacet.id, factorialDescription);
}
