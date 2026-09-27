import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { colorBleeding } from './algorithm.js';
import type { ColorBleedingFacetData } from './algorithm.js';
import { colorBleedingScene } from './scene.js';
import { colorBleedingStageView } from './color-bleeding-stage.js';
import { colorBleedingIRs } from './irs.js';
import { colorBleedingFacet } from './facet.js';

export { colorBleeding, formFactor, narrowColorBleedingData } from './algorithm.js';
export type { ColorBleedingFacetData, Emitter, Patch, Rgb, Vec2 } from './algorithm.js';
export { colorBleedingScene } from './scene.js';
export type { ColorBleedingScene, ColorBleedingStep, DirectLight, Gathering } from './scene.js';
export { colorBleedingStageView } from './color-bleeding-stage.js';
export { colorBleedingIRs } from './irs.js';
export { colorBleedingFacet } from './facet.js';

export function registerColorBleeding(): void {
  registerAlgorithm<ColorBleedingFacetData>('colorBleeding', colorBleeding, { mechanismKind: 'reactive' });
  registerScenePlan('colorBleedingScene', colorBleedingScene);
  for (const ir of colorBleedingIRs) registerIR(ir.id, ir);
  registerView('color-bleeding-stage', colorBleedingStageView);
  registerFacets([colorBleedingFacet]);
}
