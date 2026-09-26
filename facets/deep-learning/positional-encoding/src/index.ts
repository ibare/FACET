/**
 * positional-encoding 완제품 — 위치 인코딩의 주파수.
 *
 * 등록 순서 (S-facet): 알고리즘(reactive) → projector → IR(없음) → view → facet.
 * 호출은 호스트의 몫이다 — 여기서 부르지 않는다.
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { positionalEncodingAlgorithm, type PositionalEncodingData } from './algorithm.js';
import { positionalEncodingProjector } from './projector.js';
import { positionalEncodingIRs } from './irs.js';
import { positionalEncodingStageView } from './positional-encoding-stage.js';
import { positionalEncodingFacet } from './facet.js';

export {
  positionalEncodingAlgorithm,
  computePositionalEncoding,
  narrowPositionalEncoding,
  type PositionalEncodingData,
  type PositionalEncodingBoard,
} from './algorithm.js';
export { positionalEncodingProjector } from './projector.js';
export { positionalEncodingIRs } from './irs.js';
export { positionalEncodingStageView, type PositionalEncodingStage } from './positional-encoding-stage.js';
export { positionalEncodingFacet } from './facet.js';

export function registerPositionalEncoding(): void {
  registerAlgorithm<PositionalEncodingData>('positionalEncoding', positionalEncodingAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('positionalEncodingProjector', positionalEncodingProjector);
  for (const ir of positionalEncodingIRs) registerIR(ir.id, ir);
  registerView('positional-encoding-stage', positionalEncodingStageView);
  registerFacets([positionalEncodingFacet]);
}
