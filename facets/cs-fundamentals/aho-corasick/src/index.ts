/**
 * @ffacet/algorithm-aho-corasick — 등록 진입점.
 *
 * 등록은 호스트 앱의 책임이다. 이 모듈은 사이드 이펙트로 스스로 등록하지 않는다.
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { ahoCorasickAlgorithm, type AhoCorasickData } from './algorithm.js';
import { ahoCorasickProjector } from './projector.js';
import { ahoCorasickIRs } from './irs.js';
import { ahoCorasickStageView } from './aho-corasick-stage.js';
import { ahoCorasickFacet } from './facet.js';

export {
  ahoCorasickAlgorithm,
  ahoCorasickProjector,
  ahoCorasickIRs,
  ahoCorasickStageView,
  ahoCorasickFacet,
};
export {
  ahoAlphabet,
  buildAhoTrie,
  ahoScan,
  separateReadCount,
  AHO_PATTERN_COUNT_CHOICES,
} from './algorithm.js';
export { ahoCorasickImperativeIR } from './irs.js';
export type { AhoCorasickData, AhoTrie, AhoStep, AhoHit } from './algorithm.js';

export function registerAhoCorasick(): void {
  // 손잡이가 있는 완제품은 reactive 다 — 독자가 미는 것이 곧 다음 판이다.
  registerAlgorithm<AhoCorasickData>('ahoCorasick', ahoCorasickAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('ahoCorasickProjector', ahoCorasickProjector);
  for (const ir of ahoCorasickIRs) registerIR(ir.id, ir);
  registerView('aho-corasick-stage', ahoCorasickStageView);
  registerFacets([ahoCorasickFacet]);
}
