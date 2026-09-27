/**
 * combinatorics — 등록 진입점. 호스트가 registerCombinatorics() 를 부른다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { combinatoricsAlgorithm, type CombinatoricsData } from './algorithm.js';
import { combinatoricsProjector } from './projector.js';
import { combinatoricsIRs } from './irs.js';
import { combinatoricsStageView } from './combinatorics-stage.js';
import { combinatoricsFacet } from './facet.js';

export { combinatoricsAlgorithm, subsetLabel, MOTION_MS, type CombinatoricsData, type CombinatoricsRound } from './algorithm.js';
export { combinatoricsProjector } from './projector.js';
export { combinatoricsImperativeIR, combinatoricsIRs } from './irs.js';
export { combinatoricsStageView, type CombinatoricsStage } from './combinatorics-stage.js';
export { combinatoricsFacet } from './facet.js';

export function registerCombinatorics(): void {
  registerAlgorithm<CombinatoricsData>('combinatorics', combinatoricsAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('combinatoricsProjector', combinatoricsProjector);
  for (const ir of combinatoricsIRs) registerIR(ir.id, ir);
  registerView('combinatorics-stage', combinatoricsStageView);
  registerFacets([combinatoricsFacet]);
}
