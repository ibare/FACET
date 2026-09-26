/**
 * @ffacet/algorithm-preload-hint — preload-hint 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 여섯 걸음을 자동 재생하고 정지하며, 다시 보기와
 * 띠 외에는 조작을 받지 않는다.
 *
 * 화면은 명령이 아니라 **장면**에서 만들어지므로 어느 걸음으로든 곧장 갈 수
 * 있다 (S-scene). 부르는 책임은 호스트에 있다 — 여기서 사이드 이펙트로 부르지
 * 않는다 (S-facet).
 */
export { preloadHint, type CssRule, type DocLine, type DocLineKind, type PreloadHintFacetData, type ResourceSpec } from './algorithm.js';
export { preloadHintIRs } from './irs.js';
export { preloadHintFacet } from './facet.js';
export { preloadHintStageView } from './preload-hint-stage.js';
export {
  preloadHintScene,
  type DocLineScene,
  type NeededInfo,
  type PreloadHintScene,
  type PreloadHintStep,
  type ResourceLane,
} from './scene.js';

import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { preloadHint, type PreloadHintFacetData } from './algorithm.js';
import { preloadHintIRs } from './irs.js';
import { preloadHintFacet } from './facet.js';
import { preloadHintStageView } from './preload-hint-stage.js';
import { preloadHintScene } from './scene.js';

export function registerPreloadHint(): void {
  registerAlgorithm<PreloadHintFacetData>('preloadHint', preloadHint, { mechanismKind: 'reactive' });
  registerScenePlan('preloadHintScene', preloadHintScene);
  for (const ir of preloadHintIRs) registerIR(ir.id, ir);
  registerView('preload-hint-stage', preloadHintStageView);
  registerFacets([preloadHintFacet]);
}
