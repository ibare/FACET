/**
 * auth — 베어러 토큰의 수명. 등록 한 벌.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { authAlgorithm, type AuthData } from './algorithm.js';
import { authFacet } from './facet.js';
import { authIRs } from './irs.js';
import { authProjector } from './projector.js';
import { authStageView } from './auth-stage.js';

export { authAlgorithm, simulateAuth, requestTimes, type AuthData, type AuthRun } from './algorithm.js';
export { authProjector } from './projector.js';
export { authIRs } from './irs.js';
export { authStageView, type AuthStage } from './auth-stage.js';
export { authFacet } from './facet.js';

export function registerAuth(): void {
  registerAlgorithm<AuthData>('auth', authAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('authProjector', authProjector);
  for (const ir of authIRs) registerIR(ir.id, ir);
  registerView('auth-stage', authStageView);
  registerFacets([authFacet]);
}
