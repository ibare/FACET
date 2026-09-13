import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { spaceIsPartOfItAlgorithm, type SpaceIsPartOfItData } from './algorithm.js';
import { spaceIsPartOfItScene } from './scene.js';
import { spaceIsPartOfItIRs } from './irs.js';
import { spaceIsPartOfItStageView } from './space-is-part-of-it-stage.js';
import { spaceIsPartOfItFacet } from './facet.js';
import { spaceIsPartOfItDescription } from './description.js';

/**
 * 등록 진입점. 호출 책임은 호스트 앱에 있다 — 이 파일은 사이드 이펙트로 스스로
 * 부르지 않는다 (S-facet).
 *
 * `mechanismKind: 'reactive'` 를 선언하는 자리가 여기다. 조각은 컨트롤바 없이도
 * 마운트하자마자 스스로 시작하고 걸음 간격을 스스로 정해야 하는데, 그 둘을 주는
 * 것이 reactive 뿐이다 (S-piece).
 */
export function registerSpaceIsPartOfIt(): void {
  registerAlgorithm('spaceIsPartOfIt', spaceIsPartOfItAlgorithm, { mechanismKind: 'reactive' });
  registerScenePlan('spaceIsPartOfItScene', spaceIsPartOfItScene);
  for (const ir of spaceIsPartOfItIRs) registerIR(ir.id, ir);
  registerView('space-is-part-of-it-stage', spaceIsPartOfItStageView);
  registerFacets([spaceIsPartOfItFacet]);
  registerDescription(spaceIsPartOfItFacet.id, spaceIsPartOfItDescription);
}

export {
  spaceIsPartOfItAlgorithm,
  spaceIsPartOfItScene,
  spaceIsPartOfItIRs,
  spaceIsPartOfItStageView,
  spaceIsPartOfItFacet,
  spaceIsPartOfItDescription,
};
export type { SpaceIsPartOfItData };
