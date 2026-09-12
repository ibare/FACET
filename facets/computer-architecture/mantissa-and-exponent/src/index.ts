/**
 * 가수와 지수 — 등록 진입점.
 *
 * 부르는 책임은 호스트 앱에 있다. 이 파일이 사이드 이펙트로 스스로 부르지
 * 않는다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { mantissaAndExponentAlgorithm } from './algorithm.js';
import type { MantissaAndExponentData } from './algorithm.js';
import { mantissaAndExponentProjector } from './projector.js';
import { mantissaAndExponentIRs } from './irs.js';
import { mantissaAndExponentStageView } from './mantissa-and-exponent-stage.js';
import { mantissaAndExponentFacet } from './facet.js';
import { mantissaAndExponentDescription } from './description.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './mantissa-and-exponent-stage.js';
export * from './facet.js';
export * from './description.js';

export function registerMantissaAndExponent(): void {
  registerAlgorithm<MantissaAndExponentData>(
    'mantissaAndExponent',
    mantissaAndExponentAlgorithm,
    { mechanismKind: 'reactive' },
  );
  registerProjector('mantissaAndExponentProjector', mantissaAndExponentProjector);
  for (const ir of mantissaAndExponentIRs) registerIR(ir.id, ir);
  registerView('mantissa-and-exponent-stage', mantissaAndExponentStageView);
  registerFacets([mantissaAndExponentFacet]);
  registerDescription(mantissaAndExponentFacet.id, mantissaAndExponentDescription);
}
