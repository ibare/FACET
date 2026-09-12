/**
 * 등록 진입점. 호출 책임은 호스트 앱에 있다 — 이 파일은 스스로 부르지 않는다.
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { twosComplementAlgorithm, type TwosComplementData } from './algorithm.js';
import { twosComplementProjector } from './projector.js';
import { twosComplementImperativeIR, twosComplementIRs } from './irs.js';
import { twosComplementStageView } from './twos-complement-stage.js';
import { twosComplementFacet } from './facet.js';
import { twosComplementDescription } from './description.js';

export function registerTwosComplement(): void {
  registerAlgorithm<TwosComplementData>('twosComplement', twosComplementAlgorithm, {
    // 손잡이가 논증을 진다 — 폭을 밀면 그것이 다음 판의 시작이다.
    mechanismKind: 'reactive',
  });
  registerProjector('twosComplementProjector', twosComplementProjector);
  for (const ir of twosComplementIRs) registerIR(ir.id, ir);
  registerView('twos-complement-stage', twosComplementStageView);
  registerFacets([twosComplementFacet]);
  registerDescription(twosComplementFacet.id, twosComplementDescription);
}

export {
  twosComplementAlgorithm,
  twosComplementProjector,
  twosComplementImperativeIR,
  twosComplementIRs,
  twosComplementStageView,
  twosComplementFacet,
  twosComplementDescription,
};
export type { TwosComplementData };
