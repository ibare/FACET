/**
 * @ffacet/algorithm-load-factor-rehash — 적재율과 재해싱 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 아홉 걸음을 자동 재생하고 멈추며, 그 뒤에는 다시
 * 보기와 스크럽 띠가 남는다 — 둘 다 눌러야 완성되는 조작이 아니다 (S-piece).
 *
 * 화면은 장면(Scene) 방식이다. projector 를 두지 않고 `scene.ts` 가 이벤트를 상태로
 * 옮기며, stage 는 `render(next, prev, { animate })` 하나로 산다 (S-scene).
 */

export {
  loadFactorRehash,
  type LoadFactorRehashData,
  type RehashKey,
} from './algorithm.js';
export {
  loadFactorRehashScene,
  loadedCount,
  type LoadFactorRehashScene,
  type RehashCaption,
  type RehashChipScene,
  type RehashChipState,
  type RehashFormula,
  type RehashKeyScene,
  type RehashMark,
} from './scene.js';
export { loadFactorRehashIRs } from './irs.js';
export { loadFactorRehashFacet } from './facet.js';
export { loadFactorRehashDescription } from './description.js';
export { loadFactorRehashStageView } from './load-factor-rehash-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { loadFactorRehash, type LoadFactorRehashData } from './algorithm.js';
import { loadFactorRehashScene } from './scene.js';
import { loadFactorRehashIRs } from './irs.js';
import { loadFactorRehashFacet } from './facet.js';
import { loadFactorRehashDescription } from './description.js';
import { loadFactorRehashStageView } from './load-factor-rehash-stage.js';

export function registerLoadFactorRehash(): void {
  registerAlgorithm<LoadFactorRehashData>('loadFactorRehash', loadFactorRehash, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('loadFactorRehashScene', loadFactorRehashScene);
  for (const ir of loadFactorRehashIRs) registerIR(ir.id, ir);
  registerView('load-factor-rehash-stage', loadFactorRehashStageView);
  registerFacets([loadFactorRehashFacet]);
  registerDescription(loadFactorRehashFacet.id, loadFactorRehashDescription);
}
