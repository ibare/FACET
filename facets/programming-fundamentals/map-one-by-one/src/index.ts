import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { mapOneByOne, type MapOneByOneFacetData } from './algorithm.js';
import { mapOneByOneScene } from './scene.js';
import { mapOneByOneStageView } from './map-one-by-one-stage.js';
import { mapOneByOneIRs } from './irs.js';
import { mapOneByOneFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './map-one-by-one-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerMapOneByOne(): void {
  registerAlgorithm<MapOneByOneFacetData>('mapOneByOne', mapOneByOne, { mechanismKind: 'reactive' });
  registerScenePlan('mapOneByOneScene', mapOneByOneScene);
  for (const ir of mapOneByOneIRs) registerIR(ir.id, ir);
  registerView('map-one-by-one-stage', mapOneByOneStageView);
  registerFacets([mapOneByOneFacet]);
}
