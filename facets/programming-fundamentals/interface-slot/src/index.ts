import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { interfaceSlot, type InterfaceSlotFacetData } from './algorithm.js';
import { interfaceSlotScene } from './scene.js';
import { interfaceSlotStageView } from './interface-slot-stage.js';
import { interfaceSlotIRs } from './irs.js';
import { interfaceSlotFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './interface-slot-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerInterfaceSlot(): void {
  registerAlgorithm<InterfaceSlotFacetData>('interfaceSlot', interfaceSlot, { mechanismKind: 'reactive' });
  registerScenePlan('interfaceSlotScene', interfaceSlotScene);
  for (const ir of interfaceSlotIRs) registerIR(ir.id, ir);
  registerView('interface-slot-stage', interfaceSlotStageView);
  registerFacets([interfaceSlotFacet]);
}
