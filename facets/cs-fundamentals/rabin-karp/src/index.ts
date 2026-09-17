/**
 * facet:rabinKarp 의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 등록하지 않는다 — `registerRabinKarp()` 를 부르는 것은
 * 호스트 앱의 몫이다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { rabinKarpAlgorithm, type RabinKarpData } from './algorithm.js';
import { rabinKarpProjector } from './projector.js';
import { rabinKarpIRs } from './irs.js';
import { rabinKarpStageView } from './rabin-karp-stage.js';
import { rabinKarpFacet } from './facet.js';

export type {
  RabinKarpData,
  RabinKarpResult,
  RabinKarpWindow,
  RabinKarpPoint,
} from './algorithm.js';
export {
  rabinKarpAlgorithm,
  computeRabinKarp,
  rabinKarpPoints,
  windowHash,
  leadWeight,
  letterValue,
  letterValues,
  patternOf,
  pickLength,
  RABIN_KARP_LENGTHS,
} from './algorithm.js';
export { rabinKarpProjector } from './projector.js';
export { rabinKarpIRs, rabinKarpImperativeIR } from './irs.js';
export { rabinKarpStageView, readRabinKarpScene } from './rabin-karp-stage.js';
export { rabinKarpFacet } from './facet.js';

export function registerRabinKarp(): void {
  // 손잡이를 가진 완제품이라 reactive 다 — 패턴 길이를 바꾸면 알고리즘이 그
  // 입력을 받아 처음부터 다시 훑는다.
  registerAlgorithm<RabinKarpData>('rabinKarp', rabinKarpAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('rabinKarpProjector', rabinKarpProjector);
  for (const ir of rabinKarpIRs) registerIR(ir.id, ir);
  registerView('rabin-karp-stage', rabinKarpStageView);
  registerFacets([rabinKarpFacet]);
}
