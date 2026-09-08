/**
 * @ffacet/algorithm-select-min-each-pass — 조각(piece) facet.
 *
 * 등록은 호스트가 부른다. 이 모듈이 사이드 이펙트로 스스로 등록하지 않는다.
 */

export { selectMinEachPass, type SelectMinEachPassData } from './algorithm.js';
export { selectMinEachPassProjector } from './projector.js';
export { selectMinEachPassStageView } from './select-min-each-pass-stage.js';
export { selectMinEachPassIRs } from './irs.js';
export { selectMinEachPassFacet } from './facet.js';
export { selectMinEachPassDescription } from './description.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { selectMinEachPass, type SelectMinEachPassData } from './algorithm.js';
import { selectMinEachPassProjector } from './projector.js';
import { selectMinEachPassStageView } from './select-min-each-pass-stage.js';
import { selectMinEachPassIRs } from './irs.js';
import { selectMinEachPassFacet } from './facet.js';
import { selectMinEachPassDescription } from './description.js';

/** algorithm/projector/IR/view/facet/description 등록 헬퍼. */
export function registerSelectMinEachPass(): void {
  registerAlgorithm<SelectMinEachPassData>('selectMinEachPass', selectMinEachPass, {
    mechanismKind: 'reactive',
  });
  registerProjector('selectMinEachPassProjector', selectMinEachPassProjector);
  for (const ir of selectMinEachPassIRs) registerIR(ir.id, ir);
  registerView('select-min-each-pass-stage', selectMinEachPassStageView);
  registerFacets([selectMinEachPassFacet]);
  registerDescription(selectMinEachPassFacet.id, selectMinEachPassDescription);
}
