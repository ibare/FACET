/**
 * @ffacet/algorithm-walk-per-character — 글자 단위 트라이 탐색 조각(piece) 번들.
 *
 * 한 주장만 말하는 조각이다. 찾는 말 셋을 글자마다 한 칸씩 내려가 보이고 멈추며,
 * 다시 보기와 스크럽 띠 외에는 조작을 받지 않는다. 화면은 장면(Scene) 방식이라
 * 어느 걸음이든 셈으로 얻는다 — 띠를 끌어 되짚어도 같은 화면이 선다.
 */

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { walkPerCharacterAlgorithm } from './algorithm.js';
import { walkPerCharacterScene } from './scene.js';
import { walkPerCharacterIRs } from './irs.js';
import { walkPerCharacterStageView } from './walk-per-character-stage.js';
import { walkPerCharacterFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './walk-per-character-stage.js';
export * from './facet.js';

export function registerWalkPerCharacter(): void {
  registerAlgorithm('walkPerCharacter', walkPerCharacterAlgorithm, { mechanismKind: 'reactive' });
  registerScenePlan('walkPerCharacterScene', walkPerCharacterScene);
  for (const ir of walkPerCharacterIRs) registerIR(ir.id, ir);
  registerView('walk-per-character-stage', walkPerCharacterStageView);
  registerFacets([walkPerCharacterFacet]);
}
