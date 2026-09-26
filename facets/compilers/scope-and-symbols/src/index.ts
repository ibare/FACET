import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { scopeAndSymbolsAlgorithm, type ScopeAndSymbolsData } from './algorithm.js';
import { scopeAndSymbolsFacet } from './facet.js';
import { scopeAndSymbolsIRs } from './irs.js';
import { scopeAndSymbolsProjector } from './projector.js';
import { scopeAndSymbolsStageView } from './scope-and-symbols-stage.js';

export * from './algorithm.js';
export * from './facet.js';
export * from './irs.js';
export * from './projector.js';
export * from './scope-and-symbols-stage.js';

/** 손잡이(스코프 규칙)가 있어 reactive 로 등록한다 */
export function registerScopeAndSymbols(): void {
  registerAlgorithm<ScopeAndSymbolsData>('scopeAndSymbols', scopeAndSymbolsAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('scopeAndSymbolsProjector', scopeAndSymbolsProjector);
  for (const ir of scopeAndSymbolsIRs) registerIR(ir.id, ir);
  registerView('scope-and-symbols-stage', scopeAndSymbolsStageView);
  registerFacets([scopeAndSymbolsFacet]);
}
