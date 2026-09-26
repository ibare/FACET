import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { pasteTheBody, type PasteTheBodyFacetData } from './algorithm.js';
import { pasteTheBodyScene } from './scene.js';
import { pasteTheBodyIRs } from './irs.js';
import { pasteTheBodyStageView } from './paste-the-body-stage.js';
import { pasteTheBodyFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './paste-the-body-stage.js';
export * from './facet.js';

export function registerPasteTheBody(): void {
  registerAlgorithm<PasteTheBodyFacetData>('pasteTheBody', pasteTheBody, { mechanismKind: 'reactive' });
  registerScenePlan('pasteTheBodyScene', pasteTheBodyScene);
  for (const ir of pasteTheBodyIRs) registerIR(ir.id, ir);
  registerView('paste-the-body-stage', pasteTheBodyStageView);
  registerFacets([pasteTheBodyFacet]);
}
