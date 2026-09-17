/**
 * @ffacet/algorithm-count-min-sketch — 등록 진입점.
 *
 * 등록 책임은 호스트 앱에 있다. 이 파일은 사이드 이펙트로 스스로를 등록하지 않는다.
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { countMinSketchAlgorithm, type CountMinSketchData } from './algorithm.js';
import { countMinSketchProjector } from './projector.js';
import { countMinSketchIRs, countMinSketchImperativeIR } from './irs.js';
import { countMinSketchStageView } from './count-min-sketch-stage.js';
import { countMinSketchFacet } from './facet.js';

export {
  countMinSketchAlgorithm,
  countMinSketchProjector,
  countMinSketchIRs,
  countMinSketchImperativeIR,
  countMinSketchStageView,
  countMinSketchFacet,
};
export { countMinSketchCell } from './algorithm.js';
export type { CountMinSketchData };

export function registerCountMinSketch(): void {
  registerAlgorithm<CountMinSketchData>('countMinSketch', countMinSketchAlgorithm, {
    // 손잡이가 있는 완제품은 reactive 다 — 조작이 곧 다음 판의 시작이다.
    mechanismKind: 'reactive',
  });
  registerProjector('countMinSketchProjector', countMinSketchProjector);
  for (const ir of countMinSketchIRs) registerIR(ir.id, ir);
  registerView('count-min-sketch-stage', countMinSketchStageView);
  registerFacets([countMinSketchFacet]);
}
