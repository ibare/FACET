import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { resolveToDeclaration, type ResolveToDeclarationFacetData } from './algorithm.js';
import { resolveToDeclarationScene } from './scene.js';
import { resolveToDeclarationStageView } from './resolve-to-declaration-stage.js';
import { resolveToDeclarationIRs } from './irs.js';
import { resolveToDeclarationFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './resolve-to-declaration-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerResolveToDeclaration(): void {
  registerAlgorithm<ResolveToDeclarationFacetData>('resolveToDeclaration', resolveToDeclaration, { mechanismKind: 'reactive' });
  registerScenePlan('resolveToDeclarationScene', resolveToDeclarationScene);
  for (const ir of resolveToDeclarationIRs) registerIR(ir.id, ir);
  registerView('resolve-to-declaration-stage', resolveToDeclarationStageView);
  registerFacets([resolveToDeclarationFacet]);
}
