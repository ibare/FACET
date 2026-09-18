import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { refillTheEmptySlot, type RefillTheEmptySlotFacetData } from './algorithm.js';
import { refillTheEmptySlotScene } from './scene.js';
import { refillTheEmptySlotIRs } from './irs.js';
import { refillTheEmptySlotStageView } from './refill-the-empty-slot-stage.js';
import { refillTheEmptySlotFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './refill-the-empty-slot-stage.js';
export * from './facet.js';

export function registerRefillTheEmptySlot(): void {
  registerAlgorithm<RefillTheEmptySlotFacetData>('refillTheEmptySlot', refillTheEmptySlot, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('refillTheEmptySlotScene', refillTheEmptySlotScene);
  for (const ir of refillTheEmptySlotIRs) registerIR(ir.id, ir);
  registerView('refill-the-empty-slot-stage', refillTheEmptySlotStageView);
  registerFacets([refillTheEmptySlotFacet]);
}
