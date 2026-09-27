import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { lightBouncesMany, type LightBouncesManyFacetData } from './algorithm.js';
import { lightBouncesManyScene } from './scene.js';
import { lightBouncesManyStageView } from './light-bounces-many-stage.js';
import { lightBouncesManyIRs } from './irs.js';
import { lightBouncesManyFacet } from './facet.js';

export { lightBouncesMany, narrowLightBouncesMany } from './algorithm.js';
export type { LightBouncesManyFacetData, Vertex, Vec2, SurfaceId } from './algorithm.js';
export { lightBouncesManyScene } from './scene.js';
export type { LightBouncesManyScene } from './scene.js';
export { lightBouncesManyStageView } from './light-bounces-many-stage.js';
export { lightBouncesManyIRs } from './irs.js';
export { lightBouncesManyFacet } from './facet.js';

export function registerLightBouncesMany(): void {
  registerAlgorithm<LightBouncesManyFacetData>('lightBouncesMany', lightBouncesMany, { mechanismKind: 'reactive' });
  registerScenePlan('lightBouncesManyScene', lightBouncesManyScene);
  for (const ir of lightBouncesManyIRs) registerIR(ir.id, ir);
  registerView('light-bounces-many-stage', lightBouncesManyStageView);
  registerFacets([lightBouncesManyFacet]);
}
