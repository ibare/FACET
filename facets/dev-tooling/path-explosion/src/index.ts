import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { pathExplosion, type PathExplosionFacetData } from './algorithm.js';
import { pathExplosionScene } from './scene.js';
import { pathExplosionIRs } from './irs.js';
import { pathExplosionStageView } from './path-explosion-stage.js';
import { pathExplosionFacet } from './facet.js';

export {
  pathExplosion,
  splitPaths,
  pathIndex,
  startPaths,
  type PathExplosionFacetData,
} from './algorithm.js';
export {
  pathExplosionScene,
  type PathExplosionScene,
  type PathExplosionStep,
  type PassedDecision,
} from './scene.js';
export { pathExplosionIRs } from './irs.js';
export { pathExplosionStageView } from './path-explosion-stage.js';
export { pathExplosionFacet } from './facet.js';

export function registerPathExplosion(): void {
  registerAlgorithm<PathExplosionFacetData>('pathExplosion', pathExplosion, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('pathExplosionScene', pathExplosionScene);
  for (const ir of pathExplosionIRs) registerIR(ir.id, ir);
  registerView('path-explosion-stage', pathExplosionStageView);
  registerFacets([pathExplosionFacet]);
}
