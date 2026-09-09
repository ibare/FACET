/**
 * @ffacet/algorithm-scc — 강한 연결 요소 (타잔) 완결형 facet 번들.
 *
 * algorithm / projector / IR / facet JSON / description / 전용 stage view 를
 * 함께 담고 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다 (S-facet).
 */

export { scc, type SccData } from './algorithm.js';
export { sccProjector } from './projector.js';
export { sccTarjanIR, sccIRs } from './irs.js';
export { sccFacet } from './facet.js';
export { sccDescription } from './description.js';
export { sccStageView, type SccEdgeKind } from './scc-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { scc, type SccData } from './algorithm.js';
import { sccProjector } from './projector.js';
import { sccIRs } from './irs.js';
import { sccStageView } from './scc-stage.js';
import { sccFacet } from './facet.js';
import { sccDescription } from './description.js';

/** algorithm / projector / IR / view / facet / description 등록 헬퍼. */
export function registerScc(): void {
  registerAlgorithm<SccData>('scc', scc);
  registerProjector('sccProjector', sccProjector);
  for (const ir of sccIRs) registerIR(ir.id, ir);
  registerView('scc-stage', sccStageView);
  registerFacets([sccFacet]);
  registerDescription(sccFacet.id, sccDescription);
}
