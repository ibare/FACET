/**
 * @ffacet/algorithm-boyer-moore — 등록 진입점.
 *
 * 등록 책임은 호스트 앱에 있다. 이 파일은 사이드 이펙트로 스스로를 등록하지 않는다.
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { boyerMooreAlgorithm, type BoyerMooreData } from './algorithm.js';
import { boyerMooreProjector } from './projector.js';
import { boyerMooreIRs, boyerMooreImperativeIR } from './irs.js';
import { boyerMooreStageView } from './boyer-moore-stage.js';
import { boyerMooreFacet } from './facet.js';
import { boyerMooreDescription } from './description.js';

export {
  boyerMooreAlgorithm,
  boyerMooreProjector,
  boyerMooreIRs,
  boyerMooreImperativeIR,
  boyerMooreStageView,
  boyerMooreFacet,
  boyerMooreDescription,
};
export { buildBadCharTable, BOYER_MOORE_ALPHABET } from './algorithm.js';
export type { BoyerMooreData };

export function registerBoyerMoore(): void {
  registerAlgorithm<BoyerMooreData>('boyerMoore', boyerMooreAlgorithm, {
    // 손잡이가 있는 완제품은 reactive 다 — 조작이 곧 다음 판의 시작이다.
    mechanismKind: 'reactive',
  });
  registerProjector('boyerMooreProjector', boyerMooreProjector);
  for (const ir of boyerMooreIRs) registerIR(ir.id, ir);
  registerView('boyer-moore-stage', boyerMooreStageView);
  registerFacets([boyerMooreFacet]);
  registerDescription(boyerMooreFacet.id, boyerMooreDescription);
}
