import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { fundamentalTheorem, type FundamentalTheoremFacetData } from './algorithm.js';
import { fundamentalTheoremScene } from './scene.js';
import { fundamentalTheoremStageView } from './fundamental-theorem-stage.js';
import { fundamentalTheoremIRs } from './irs.js';
import { fundamentalTheoremFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './fundamental-theorem-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerFundamentalTheorem(): void {
  registerAlgorithm<FundamentalTheoremFacetData>('fundamentalTheorem', fundamentalTheorem, { mechanismKind: 'reactive' });
  registerScenePlan('fundamentalTheoremScene', fundamentalTheoremScene);
  for (const ir of fundamentalTheoremIRs) registerIR(ir.id, ir);
  registerView('fundamental-theorem-stage', fundamentalTheoremStageView);
  registerFacets([fundamentalTheoremFacet]);
}
