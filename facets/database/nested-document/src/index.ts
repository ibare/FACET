import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { nestedDocument, type NestedDocumentFacetData } from './algorithm.js';
import { nestedDocumentScene } from './scene.js';
import { nestedDocumentStageView } from './nested-document-stage.js';
import { nestedDocumentIRs } from './irs.js';
import { nestedDocumentFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './nested-document-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerNestedDocument(): void {
  registerAlgorithm<NestedDocumentFacetData>('nestedDocument', nestedDocument, { mechanismKind: 'reactive' });
  registerScenePlan('nestedDocumentScene', nestedDocumentScene);
  for (const ir of nestedDocumentIRs) registerIR(ir.id, ir);
  registerView('nested-document-stage', nestedDocumentStageView);
  registerFacets([nestedDocumentFacet]);
}
