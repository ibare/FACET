/**
 * 자리값과 진법 조각의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 등록하지 않는다 — 부르는 책임은 호스트에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { positionalValueAlgorithm } from './algorithm.js';
import { positionalValueProjector } from './projector.js';
import { positionalValueIRs } from './irs.js';
import { positionalValueFacet } from './facet.js';
import { positionalValueDescription } from './description.js';
import { positionalValueStageView } from './positional-value-stage.js';

export { positionalValueAlgorithm, computePositionalValueFacts } from './algorithm.js';
export type {
  PositionalValueData,
  PositionalValueFacts,
  PositionalGrouping,
} from './algorithm.js';
export { positionalValueProjector } from './projector.js';
export { positionalValueIRs } from './irs.js';
export { positionalValueFacet } from './facet.js';
export { positionalValueDescription } from './description.js';
export { positionalValueStageView } from './positional-value-stage.js';

export function registerPositionalValue(): void {
  registerAlgorithm('positionalValue', positionalValueAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('positionalValueProjector', positionalValueProjector);
  for (const ir of positionalValueIRs) registerIR(ir.id, ir);
  registerView('positional-value-stage', positionalValueStageView);
  registerFacets([positionalValueFacet]);
  registerDescription(positionalValueFacet.id, positionalValueDescription);
}
