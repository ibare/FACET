import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { saturateAndVanish, type SaturateAndVanishFacetData } from './algorithm.js';
import { saturateAndVanishScene } from './scene.js';
import { saturateAndVanishStageView } from './saturate-and-vanish-stage.js';
import { saturateAndVanishIRs } from './irs.js';
import { saturateAndVanishFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './saturate-and-vanish-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerSaturateAndVanish(): void {
  registerAlgorithm<SaturateAndVanishFacetData>('saturateAndVanish', saturateAndVanish, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('saturateAndVanishScene', saturateAndVanishScene);
  for (const ir of saturateAndVanishIRs) registerIR(ir.id, ir);
  registerView('saturate-and-vanish-stage', saturateAndVanishStageView);
  registerFacets([saturateAndVanishFacet]);
}
