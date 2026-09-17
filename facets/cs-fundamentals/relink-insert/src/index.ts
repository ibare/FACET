/**
 * relink-insert 조각의 등록 진입점.
 *
 * 부수효과로 스스로 등록하지 않는다 — 언제 등록할지는 호스트 앱이 정한다
 * (S-facet).
 *
 * 화면은 장면(Scene) 방식이다. projector 를 두지 않고 `scene.ts` 가 이벤트를 상태로
 * 옮기며, stage 는 `render(next, prev, { animate })` 하나로 산다 (S-scene).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { relinkInsertAlgorithm, type RelinkInsertData } from './algorithm.js';
import { relinkInsertScene } from './scene.js';
import { relinkInsertIRs } from './irs.js';
import { relinkStageView } from './relink-stage.js';
import { relinkInsertFacet } from './facet.js';

export { relinkInsertAlgorithm } from './algorithm.js';
export type { RelinkInsertData, RelinkNode } from './algorithm.js';
export { relinkInsertScene } from './scene.js';
export type {
  RelinkCaption,
  RelinkInsertScene,
  RelinkLink,
  RelinkSceneNode,
  RelinkStep,
  RelinkTally,
} from './scene.js';
export { relinkInsertIRs } from './irs.js';
export { relinkStageView } from './relink-stage.js';
export type { RelinkStage } from './relink-stage.js';
export { relinkInsertFacet } from './facet.js';

export function registerRelinkInsert(): void {
  registerAlgorithm<RelinkInsertData>('relinkInsert', relinkInsertAlgorithm, {
    // 컨트롤바 없이도 mount 시 스스로 재생하고, 걸음 간격을 스스로 정한다 (S-piece).
    mechanismKind: 'reactive',
  });
  registerScenePlan('relinkInsertScene', relinkInsertScene);
  for (const ir of relinkInsertIRs) registerIR(ir.id, ir);
  registerView('relink-insert-stage', relinkStageView);
  registerFacets([relinkInsertFacet]);
}
