import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { foldAtCompile, type FoldAtCompileFacetData } from './algorithm.js';
import { foldAtCompileScene } from './scene.js';
import { foldAtCompileStageView } from './fold-at-compile-stage.js';
import { foldAtCompileIRs } from './irs.js';
import { foldAtCompileFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './fold-at-compile-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerFoldAtCompile(): void {
  registerAlgorithm<FoldAtCompileFacetData>('foldAtCompile', foldAtCompile, { mechanismKind: 'reactive' });
  registerScenePlan('foldAtCompileScene', foldAtCompileScene);
  for (const ir of foldAtCompileIRs) registerIR(ir.id, ir);
  registerView('fold-at-compile-stage', foldAtCompileStageView);
  registerFacets([foldAtCompileFacet]);
}
