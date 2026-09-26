/**
 * history-bisect 진입점 — 알고리즘 · projector · IR · 무대 · 선언을 내놓고 등록 함수 하나를 둔다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { historyBisectAlgorithm, type HistoryBisectData } from './algorithm.js';
import { historyBisectProjector } from './projector.js';
import { historyBisectIRs } from './irs.js';
import { historyBisectStageView } from './history-bisect-stage.js';
import { historyBisectFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './history-bisect-stage.js';
export * from './facet.js';

export function registerHistoryBisect(): void {
  registerAlgorithm<HistoryBisectData>('historyBisect', historyBisectAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('historyBisectProjector', historyBisectProjector);
  for (const ir of historyBisectIRs) registerIR(ir.id, ir);
  registerView('history-bisect-stage', historyBisectStageView);
  registerFacets([historyBisectFacet]);
}
