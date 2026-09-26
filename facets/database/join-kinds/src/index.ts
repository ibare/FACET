/**
 * join-kinds — 조인 종류. 등록 순서: algorithm → projector → IR → view → facet.
 * 손잡이가 있어 algorithm 을 reactive 로 등록한다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { joinKindsAlgorithm, type JoinKindsData } from './algorithm.js';
import { joinKindsProjector } from './projector.js';
import { joinKindsIRs } from './irs.js';
import { joinKindsStageView } from './join-kinds-stage.js';
import { joinKindsFacet } from './facet.js';

export * from './algorithm.js';
export { joinKindsProjector } from './projector.js';
export { joinKindsImperativeIR, joinKindsIRs } from './irs.js';
export { joinKindsStageView } from './join-kinds-stage.js';
export type { JoinKindsStage, StageRow, StageSpec, StageQuery, StageTable } from './join-kinds-stage.js';
export { joinKindsFacet } from './facet.js';

export function registerJoinKinds(): void {
  registerAlgorithm<JoinKindsData>('joinKinds', joinKindsAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('joinKindsProjector', joinKindsProjector);
  for (const ir of joinKindsIRs) registerIR(ir.id, ir);
  registerView('join-kinds-stage', joinKindsStageView);
  registerFacets([joinKindsFacet]);
}
