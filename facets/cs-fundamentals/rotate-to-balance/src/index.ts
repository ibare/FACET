import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';

import { rotateToBalanceAlgorithm } from './algorithm.js';
import { rotateToBalanceProjector } from './projector.js';
import { rotateToBalanceIRs } from './irs.js';
import { rotateToBalanceStageView } from './rotate-to-balance-stage.js';
import { rotateToBalanceFacet } from './facet.js';
import { rotateToBalanceDescription } from './description.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './rotate-to-balance-stage.js';
export * from './facet.js';
export * from './description.js';

export function registerRotateToBalance(): void {
  registerAlgorithm('rotateToBalance', rotateToBalanceAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('rotateToBalanceProjector', rotateToBalanceProjector);
  for (const ir of rotateToBalanceIRs) registerIR(ir.id, ir);
  registerView('rotate-to-balance-stage', rotateToBalanceStageView);
  registerFacets([rotateToBalanceFacet]);
  registerDescription(rotateToBalanceFacet.id, rotateToBalanceDescription);
}
