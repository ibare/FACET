/**
 * @ffacet/algorithm-hash-chain — 해시 사슬 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 네 걸음을 자동 재생하고 정지하며, 다시 보기와 띠
 * 외에는 조작을 받지 않는다.
 *
 * 화면은 명령이 아니라 **장면**에서 만들어지므로 어느 걸음으로든 곧장 갈 수 있다
 * (S-scene). 부르는 책임은 호스트에 있다 — 여기서 사이드 이펙트로 부르지 않는다
 * (S-facet).
 */

export { hashChain, type HashChainFacetData, type ChainBlock } from './algorithm.js';
export { hashChainIRs } from './irs.js';
export { hashChainFacet } from './facet.js';
export { chainStageView } from './chain-stage.js';
export {
  hashChainScene,
  type BlockMark,
  type BlockView,
  type FieldView,
  type HashChainCaption,
  type HashChainScene,
  type HashChainStep,
  type SceneBlock,
} from './scene.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { hashChain, type HashChainFacetData } from './algorithm.js';
import { hashChainIRs } from './irs.js';
import { hashChainFacet } from './facet.js';
import { chainStageView } from './chain-stage.js';
import { hashChainScene } from './scene.js';

export function registerHashChain(): void {
  registerAlgorithm<HashChainFacetData>('hashChain', hashChain, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('hashChainScene', hashChainScene);
  for (const ir of hashChainIRs) registerIR(ir.id, ir);
  registerView('chain-stage', chainStageView);
  registerFacets([hashChainFacet]);
}
