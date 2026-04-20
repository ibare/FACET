export { fibonaccimemo, type FibonacciMemoData } from './algorithm.js';
export { fibonaccimemoProjector } from './projector.js';
export { fibonaccimemoImperativeIR, fibonaccimemoIRs } from './irs.js';
export { fibonaccimemoFacet } from './facet.js';
export { fibonaccimemoDescription } from './description.js';

import {
  registerAlgorithm,
  registerProjector,
  registerFacets,
  registerIR,
  registerDescription,
} from '@facet/core/runtime';
import { fibonaccimemo, type FibonacciMemoData } from './algorithm.js';
import { fibonaccimemoProjector } from './projector.js';
import { fibonaccimemoIRs } from './irs.js';
import { fibonaccimemoFacet } from './facet.js';
import { fibonaccimemoDescription } from './description.js';

export function registerFibonaccimemo(): void {
  registerAlgorithm<FibonacciMemoData>('fibonaccimemo', async (ctx) => {
    await fibonaccimemo(ctx);
  });
  registerProjector('fibonaccimemoProjector', fibonaccimemoProjector);
  for (const ir of fibonaccimemoIRs) registerIR(ir.id, ir);
  registerFacets([fibonaccimemoFacet]);
  registerDescription(fibonaccimemoFacet.id, fibonaccimemoDescription);
}
