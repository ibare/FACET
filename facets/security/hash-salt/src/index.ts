/**
 * @ffacet/algorithm-hash-salt — 소금 치기 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 네 걸음을 자동 재생하고 정지하며, 다시 보기와 띠
 * 외에는 조작을 받지 않는다.
 *
 * 화면은 명령이 아니라 **장면**에서 만들어지므로 어느 걸음으로든 곧장 갈 수 있다
 * (S-scene). 부르는 책임은 호스트에 있다 — 여기서 사이드 이펙트로 부르지 않는다
 * (S-facet).
 */

export { hashSalt, type HashSaltFacetData, type SaltedUser } from './algorithm.js';
export { hashSaltIRs } from './irs.js';
export { hashSaltFacet } from './facet.js';
export { saltStageView } from './salt-stage.js';
export {
  hashSaltScene,
  type HashSaltCaption,
  type HashSaltScene,
  type HashSaltStep,
  type SceneUser,
} from './scene.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { hashSalt, type HashSaltFacetData } from './algorithm.js';
import { hashSaltIRs } from './irs.js';
import { hashSaltFacet } from './facet.js';
import { saltStageView } from './salt-stage.js';
import { hashSaltScene } from './scene.js';

export function registerHashSalt(): void {
  registerAlgorithm<HashSaltFacetData>('hashSalt', hashSalt, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('hashSaltScene', hashSaltScene);
  for (const ir of hashSaltIRs) registerIR(ir.id, ir);
  registerView('salt-stage', saltStageView);
  registerFacets([hashSaltFacet]);
}
