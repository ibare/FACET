/**
 * @ffacet/algorithm-mvcc — 오래 연 스냅샷이 옛 판을 붙잡는다.
 *
 * 손잡이가 있어 reactive 로 등록한다. `registerMvcc()` 는 스스로 부르지 않는다 — 호스트가 부른다.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { mvccAlgorithm, type MvccData } from './algorithm.js';
import { mvccFacet } from './facet.js';
import { mvccIRs } from './irs.js';
import { mvccStageView } from './mvcc-stage.js';
import { mvccProjector } from './projector.js';

export * from './algorithm.js';
export * from './facet.js';
export * from './irs.js';
export * from './mvcc-stage.js';
export * from './projector.js';

export function registerMvcc(): void {
  registerAlgorithm<MvccData>('mvcc', mvccAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('mvccProjector', mvccProjector);
  for (const ir of mvccIRs) registerIR(ir.id, ir);
  registerView('mvcc-stage', mvccStageView);
  registerFacets([mvccFacet]);
}
