/**
 * @ffacet/algorithm-coarse-then-fine — 위층에서 내려오기 (조각).
 *
 * 등록 책임은 호스트 앱에 있다. 이 파일은 사이드 이펙트로 register 를 부르지
 * 않는다 (S-facet).
 */

export {
  coarseThenFine,
  flatSearch,
  neighborsOf,
  type CoarseThenFineData,
  type CoarseThenFineLayer,
  type CoarseThenFinePoint,
} from './algorithm.js';
export { coarseThenFineProjector } from './projector.js';
export { coarseThenFineIRs } from './irs.js';
export { coarseThenFineFacet } from './facet.js';
export { coarseThenFineDescription } from './description.js';
export { coarseThenFineStageView, readScene } from './coarse-then-fine-stage.js';

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { coarseThenFine, type CoarseThenFineData } from './algorithm.js';
import { coarseThenFineProjector } from './projector.js';
import { coarseThenFineIRs } from './irs.js';
import { coarseThenFineFacet } from './facet.js';
import { coarseThenFineDescription } from './description.js';
import { coarseThenFineStageView } from './coarse-then-fine-stage.js';

export function registerCoarseThenFine(): void {
  // 조각은 마운트 즉시 스스로 재생하고 걸음 간격도 스스로 정해야 하므로
  // reactive 뿐이다 (S-piece). mechanismKind 를 선언하는 자리는 여기다.
  registerAlgorithm<CoarseThenFineData>('coarseThenFine', coarseThenFine, {
    mechanismKind: 'reactive',
  });
  // projector 이름은 algorithm 과 겹치지 않게 둔다 — 겹치면 `module:` 참조가
  // 어느 쪽인지 말하지 못한다 (C4, register-names 전수 검사).
  registerProjector('coarseThenFineProjector', coarseThenFineProjector);
  for (const ir of coarseThenFineIRs) registerIR(ir.id, ir);
  registerView('coarse-then-fine-stage', coarseThenFineStageView);
  registerFacets([coarseThenFineFacet]);
  registerDescription(coarseThenFineFacet.id, coarseThenFineDescription);
}
