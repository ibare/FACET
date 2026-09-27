/**
 * @ffacet/algorithm-handshake-lemma — 악수 정리 조각(piece) facet 번들.
 *
 * 간선 일곱을 하나씩 놓으며 자동 재생하고 멈춘다. 다시 보기와 띠 말고는 조작을
 * 받지 않는다. 화면은 장면에서 만들어지므로 어느 걸음으로든 곧장 갈 수 있다 (S-scene).
 * 등록 함수를 부르는 책임은 호스트에 있다 — 여기서 스스로 부르지 않는다 (S-facet).
 */

export {
  handshakeLemma,
  narrowHandshakeData,
  type HandshakeLemmaFacetData,
} from './algorithm.js';
export { handshakeLemmaScene, type HandshakeScene, type HandshakeStep } from './scene.js';
export { handshakeLemmaStageView } from './handshake-lemma-stage.js';
export { handshakeLemmaIRs } from './irs.js';
export { handshakeLemmaFacet } from './facet.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { handshakeLemma, type HandshakeLemmaFacetData } from './algorithm.js';
import { handshakeLemmaScene } from './scene.js';
import { handshakeLemmaStageView } from './handshake-lemma-stage.js';
import { handshakeLemmaIRs } from './irs.js';
import { handshakeLemmaFacet } from './facet.js';

export function registerHandshakeLemma(): void {
  registerAlgorithm<HandshakeLemmaFacetData>('handshakeLemma', handshakeLemma, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('handshakeLemmaScene', handshakeLemmaScene);
  for (const ir of handshakeLemmaIRs) registerIR(ir.id, ir);
  registerView('handshake-lemma-stage', handshakeLemmaStageView);
  registerFacets([handshakeLemmaFacet]);
}
