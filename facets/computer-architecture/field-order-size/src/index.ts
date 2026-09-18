import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { fieldOrderSize, type FieldOrderSizeFacetData } from './algorithm.js';
import { fieldOrderSizeFacet } from './facet.js';
import { fieldOrderSizeIRs } from './irs.js';
import { fieldOrderSizeScene } from './scene.js';
import { fieldOrderSizeStageView } from './field-order-size-stage.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './field-order-size-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerFieldOrderSize(): void {
  registerAlgorithm<FieldOrderSizeFacetData>('fieldOrderSize', fieldOrderSize, { mechanismKind: 'reactive' });
  registerScenePlan('fieldOrderSizeScene', fieldOrderSizeScene);
  for (const ir of fieldOrderSizeIRs) registerIR(ir.id, ir);
  registerView('field-order-size-stage', fieldOrderSizeStageView);
  registerFacets([fieldOrderSizeFacet]);
}
