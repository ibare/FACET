import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { selectorRightToLeft, type SelectorRightToLeftFacetData } from './algorithm.js';
import { selectorRightToLeftScene } from './scene.js';
import { selectorRightToLeftStageView } from './selector-right-to-left-stage.js';
import { selectorRightToLeftIRs } from './irs.js';
import { selectorRightToLeftFacet } from './facet.js';

export { selectorRightToLeft, type SelectorRightToLeftFacetData, type DomNode } from './algorithm.js';
export { selectorRightToLeftScene, type SelectorScene } from './scene.js';
export { selectorRightToLeftStageView } from './selector-right-to-left-stage.js';
export { selectorRightToLeftIRs } from './irs.js';
export { selectorRightToLeftFacet } from './facet.js';

export function registerSelectorRightToLeft(): void {
  registerAlgorithm<SelectorRightToLeftFacetData>('selectorRightToLeft', selectorRightToLeft, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('selectorRightToLeftScene', selectorRightToLeftScene);
  for (const ir of selectorRightToLeftIRs) registerIR(ir.id, ir);
  registerView('selector-right-to-left-stage', selectorRightToLeftStageView);
  registerFacets([selectorRightToLeftFacet]);
}
