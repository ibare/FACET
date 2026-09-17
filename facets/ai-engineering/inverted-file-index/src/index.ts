/**
 * 역파일 색인 완제품의 등록 진입점.
 *
 * `mechanismKind: 'reactive'` 를 여기서 선언한다 — 손잡이(segmented-slider)가
 * 붙은 완제품은 coroutine 으로 돌 수 없다. `CoroutineMechanism.supportedControls`
 * 에 facet 고유 어휘가 없어 러너가 마운트 시점에 throw 하고, 통과하더라도
 * `dispatch` 가 no-op 이라 손잡이가 algorithm 에 닿지 않는다.
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core';

import { invertedFileIndexAlgorithm, type InvertedFileIndexData } from './algorithm.js';
import { invertedFileIndexProjector } from './projector.js';
import { invertedFileIndexIRs } from './irs.js';
import { invertedFileIndexStageView } from './inverted-file-index-stage.js';
import { invertedFileIndexFacet } from './facet.js';

export { invertedFileIndexAlgorithm, type InvertedFileIndexData } from './algorithm.js';
export { invertedFileIndexProjector } from './projector.js';
export { invertedFileIndexIRs } from './irs.js';
export { invertedFileIndexStageView } from './inverted-file-index-stage.js';
export { invertedFileIndexFacet } from './facet.js';

export function registerInvertedFileIndex(): void {
  registerAlgorithm<InvertedFileIndexData>('invertedFileIndex', invertedFileIndexAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('invertedFileIndexProjector', invertedFileIndexProjector);
  for (const ir of invertedFileIndexIRs) registerIR(ir.id, ir);
  registerView('inverted-file-index-stage', invertedFileIndexStageView);
  registerFacets([invertedFileIndexFacet]);
}
