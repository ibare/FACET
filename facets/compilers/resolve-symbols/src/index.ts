import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { resolveSymbols, type ResolveSymbolsFacetData } from './algorithm.js';
import { resolveSymbolsScene } from './scene.js';
import { resolveSymbolsStageView } from './resolve-symbols-stage.js';
import { resolveSymbolsIRs } from './irs.js';
import { resolveSymbolsFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './resolve-symbols-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerResolveSymbols(): void {
  registerAlgorithm<ResolveSymbolsFacetData>('resolveSymbols', resolveSymbols, { mechanismKind: 'reactive' });
  registerScenePlan('resolveSymbolsScene', resolveSymbolsScene);
  for (const ir of resolveSymbolsIRs) registerIR(ir.id, ir);
  registerView('resolve-symbols-stage', resolveSymbolsStageView);
  registerFacets([resolveSymbolsFacet]);
}
