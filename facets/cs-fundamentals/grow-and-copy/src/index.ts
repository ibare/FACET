/**
 * @ffacet/algorithm-grow-and-copy — 재할당 조각(piece) facet 번들.
 *
 * 꽉 찬 자리에 하나를 더 넣으려다 막히는 데서 시작해, 두 배짜리 자리로 값을
 * 옮기고 옛 자리를 버리는 데서 멈춘다. 자동 재생이 끝나면 다시 보기와 스크럽 띠가
 * 남는다 — 둘 다 눌러야 완성되는 조작이 아니다 (S-piece).
 *
 * 화면은 장면(Scene) 방식이다. projector 를 두지 않고 `scene.ts` 가 이벤트를 상태로
 * 옮기며, stage 는 `render(next, prev, { animate })` 하나로 산다 (S-scene).
 */

export { growAndCopy, type GrowAndCopyData } from './algorithm.js';
export {
  growAndCopyScene,
  type GrowAndCopyScene,
  type GrowBlockScene,
  type GrowCaption,
  type GrowMark,
} from './scene.js';
export { growAndCopyIRs } from './irs.js';
export { growAndCopyFacet } from './facet.js';
export { growAndCopyStageView, type GrowAndCopyStage } from './grow-and-copy-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { growAndCopy, type GrowAndCopyData } from './algorithm.js';
import { growAndCopyScene } from './scene.js';
import { growAndCopyIRs } from './irs.js';
import { growAndCopyFacet } from './facet.js';
import { growAndCopyStageView } from './grow-and-copy-stage.js';

export function registerGrowAndCopy(): void {
  registerAlgorithm<GrowAndCopyData>('growAndCopy', growAndCopy, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('growAndCopyScene', growAndCopyScene);
  for (const ir of growAndCopyIRs) registerIR(ir.id, ir);
  registerView('grow-and-copy-stage', growAndCopyStageView);
  registerFacets([growAndCopyFacet]);
}
