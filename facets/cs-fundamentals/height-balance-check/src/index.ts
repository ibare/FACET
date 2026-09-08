/**
 * height-balance-check — 등록 진입점. 호출 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';

import { heightBalanceCheckAlgorithm } from './algorithm.js';
import { heightBalanceCheckProjector } from './projector.js';
import { heightBalanceCheckIRs } from './irs.js';
import { heightBalanceCheckStageView } from './height-balance-check-stage.js';
import { heightBalanceCheckFacet } from './facet.js';
import { heightBalanceCheckDescription } from './description.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './height-balance-check-stage.js';
export * from './facet.js';
export * from './description.js';

export function registerHeightBalanceCheck(): void {
  registerAlgorithm('heightBalanceCheck', heightBalanceCheckAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('heightBalanceCheckProjector', heightBalanceCheckProjector);
  for (const ir of heightBalanceCheckIRs) registerIR(ir.id, ir);
  registerView('height-balance-check-stage', heightBalanceCheckStageView);
  registerFacets([heightBalanceCheckFacet]);
  registerDescription(heightBalanceCheckFacet.id, heightBalanceCheckDescription);
}
