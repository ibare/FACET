/**
 * @ffacet/algorithm-grow-and-copy — 재할당 조각(piece) facet 번들.
 *
 * 꽉 찬 자리에 하나를 더 넣으려다 막히는 데서 시작해, 두 배짜리 자리로 값을
 * 옮기고 옛 자리를 버리는 데서 멈춘다. 자동 재생이 끝나면 다시 보기와 한 걸음씩
 * 두 버튼만 남는다 — 둘 다 눌러야 완성되는 조작이 아니다 (S-piece).
 */

export { growAndCopy, type GrowAndCopyData } from './algorithm.js';
export { growAndCopyProjector } from './projector.js';
export { growAndCopyIRs } from './irs.js';
export { growAndCopyFacet } from './facet.js';
export { growAndCopyDescription } from './description.js';
export { growAndCopyStageView, type GrowAndCopyStageInit } from './grow-and-copy-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { growAndCopy, type GrowAndCopyData } from './algorithm.js';
import { growAndCopyProjector } from './projector.js';
import { growAndCopyIRs } from './irs.js';
import { growAndCopyFacet } from './facet.js';
import { growAndCopyDescription } from './description.js';
import { growAndCopyStageView } from './grow-and-copy-stage.js';

export function registerGrowAndCopy(): void {
  registerAlgorithm<GrowAndCopyData>('growAndCopy', growAndCopy, {
    mechanismKind: 'reactive',
  });
  registerProjector('growAndCopyProjector', growAndCopyProjector);
  for (const ir of growAndCopyIRs) registerIR(ir.id, ir);
  registerView('grow-and-copy-stage', growAndCopyStageView);
  registerFacets([growAndCopyFacet]);
  registerDescription(growAndCopyFacet.id, growAndCopyDescription);
}
