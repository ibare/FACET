/**
 * roc-imbalance — 음성 배수 · 문턱 두 손잡이. 등록은 호스트가 register 함수를 불러서 한다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { rocImbalanceAlgorithm, type RocImbalanceData } from './algorithm.js';
import { rocImbalanceProjector } from './projector.js';
import { rocImbalanceIRs } from './irs.js';
import { rocImbalanceStageView } from './roc-imbalance-stage.js';
import { rocImbalanceFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './roc-imbalance-stage.js';
export * from './facet.js';

export function registerRocImbalance(): void {
  registerAlgorithm<RocImbalanceData>('rocImbalance', rocImbalanceAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('rocImbalanceProjector', rocImbalanceProjector);
  for (const ir of rocImbalanceIRs) registerIR(ir.id, ir);
  registerView('roc-imbalance-stage', rocImbalanceStageView);
  registerFacets([rocImbalanceFacet]);
}
