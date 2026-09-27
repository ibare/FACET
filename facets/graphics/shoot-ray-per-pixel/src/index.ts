import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { shootRayPerPixel, type ShootRayPerPixelFacetData } from './algorithm.js';
import { shootRayPerPixelScene } from './scene.js';
import { shootRayPerPixelStageView } from './shoot-ray-per-pixel-stage.js';
import { shootRayPerPixelIRs } from './irs.js';
import { shootRayPerPixelFacet } from './facet.js';

export {
  shootRayPerPixel,
  narrowShootRayData,
  cellCenter,
  pixelSize,
  shootCell,
  type ShootRayPerPixelFacetData,
  type RayCell,
  type Vec3,
} from './algorithm.js';
export { shootRayPerPixelScene, type ShootRayScene, type ShootRayStep, type ShootRayRow, type ShootRayBase } from './scene.js';
export { shootRayPerPixelStageView } from './shoot-ray-per-pixel-stage.js';
export { shootRayPerPixelIRs } from './irs.js';
export { shootRayPerPixelFacet } from './facet.js';

export function registerShootRayPerPixel(): void {
  registerAlgorithm<ShootRayPerPixelFacetData>('shootRayPerPixel', shootRayPerPixel, { mechanismKind: 'reactive' });
  registerScenePlan('shootRayPerPixelScene', shootRayPerPixelScene);
  for (const ir of shootRayPerPixelIRs) registerIR(ir.id, ir);
  registerView('shoot-ray-per-pixel-stage', shootRayPerPixelStageView);
  registerFacets([shootRayPerPixelFacet]);
}
