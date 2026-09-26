/**
 * 문서와 키-값 — 등록 진입점. 호출은 호스트의 몫이다.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { documentKvAlgorithm, type DocumentKvData } from './algorithm.js';
import { documentKvProjector } from './projector.js';
import { documentKvIRs } from './irs.js';
import { documentKvStageView } from './document-kv-stage.js';
import { documentKvFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './document-kv-stage.js';
export * from './facet.js';

export function registerDocumentKv(): void {
  registerAlgorithm<DocumentKvData>('documentKv', documentKvAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('documentKvProjector', documentKvProjector);
  for (const ir of documentKvIRs) registerIR(ir.id, ir);
  registerView('document-kv-stage', documentKvStageView);
  registerFacets([documentKvFacet]);
}
