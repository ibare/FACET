import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { moveLooksLikeRewrite, type MoveLooksLikeRewriteFacetData } from './algorithm.js';
import { moveLooksLikeRewriteScene } from './scene.js';
import { moveLooksLikeRewriteStageView } from './move-looks-like-rewrite-stage.js';
import { moveLooksLikeRewriteIRs } from './irs.js';
import { moveLooksLikeRewriteFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './move-looks-like-rewrite-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerMoveLooksLikeRewrite(): void {
  registerAlgorithm<MoveLooksLikeRewriteFacetData>('moveLooksLikeRewrite', moveLooksLikeRewrite, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('moveLooksLikeRewriteScene', moveLooksLikeRewriteScene);
  for (const ir of moveLooksLikeRewriteIRs) registerIR(ir.id, ir);
  registerView('move-looks-like-rewrite-stage', moveLooksLikeRewriteStageView);
  registerFacets([moveLooksLikeRewriteFacet]);
}
