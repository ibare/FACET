import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { criticalSection, type CriticalSectionFacetData } from './algorithm.js';
import { criticalSectionScene } from './scene.js';
import { criticalSectionStageView } from './critical-section-stage.js';
import { criticalSectionIRs } from './irs.js';
import { criticalSectionFacet } from './facet.js';

export { criticalSection, touchesShared, type CriticalSectionFacetData } from './algorithm.js';
export { criticalSectionScene, type CriticalSectionScene, type CriticalSectionStep, type Spot } from './scene.js';
export { criticalSectionStageView } from './critical-section-stage.js';
export { criticalSectionIRs } from './irs.js';
export { criticalSectionFacet } from './facet.js';

export function registerCriticalSection(): void {
  registerAlgorithm<CriticalSectionFacetData>('criticalSection', criticalSection, { mechanismKind: 'reactive' });
  registerScenePlan('criticalSectionScene', criticalSectionScene);
  for (const ir of criticalSectionIRs) registerIR(ir.id, ir);
  registerView('critical-section-stage', criticalSectionStageView);
  registerFacets([criticalSectionFacet]);
}
