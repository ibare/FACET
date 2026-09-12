/**
 * 등록 진입점. 호스트 앱이 부른다 — 이 파일은 사이드 이펙트로 스스로 부르지
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

import { associativityReliefAlgorithm, type AssociativityReliefData } from './algorithm.js';
import { associativityReliefProjector } from './projector.js';
import { associativityReliefIRs } from './irs.js';
import { associativityReliefStageView } from './associativity-relief-stage.js';
import { associativityReliefFacet } from './facet.js';
import { associativityReliefDescription } from './description.js';

export {
  associativityReliefAlgorithm,
  associativityReliefProjector,
  associativityReliefIRs,
  associativityReliefStageView,
  associativityReliefFacet,
  associativityReliefDescription,
};
export type { AssociativityReliefData };

export function registerAssociativityRelief(): void {
  registerAlgorithm<AssociativityReliefData>('associativityRelief', associativityReliefAlgorithm, {
    // 조각은 마운트하면 스스로 재생을 시작하고 걸음 간격을 스스로 정한다 (S-piece).
    mechanismKind: 'reactive',
  });
  // 등록 이름은 algorithm 과 겹치지 않게 둔다 (C4).
  registerProjector('associativityReliefProjector', associativityReliefProjector);
  for (const ir of associativityReliefIRs) registerIR(ir.id, ir);
  registerView('associativity-relief-stage', associativityReliefStageView);
  registerFacets([associativityReliefFacet]);
  registerDescription(associativityReliefFacet.id, associativityReliefDescription);
}
