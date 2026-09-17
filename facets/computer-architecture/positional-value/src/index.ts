/**
 * 자리값과 진법 조각의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 등록하지 않는다 — 부르는 책임은 호스트에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { positionalValueAlgorithm } from './algorithm.js';
import { positionalValueScene } from './scene.js';
import { positionalValueIRs } from './irs.js';
import { positionalValueFacet } from './facet.js';
import { positionalValueStageView } from './positional-value-stage.js';

export { positionalValueAlgorithm, computePositionalValueFacts } from './algorithm.js';
export type {
  PositionalValueData,
  PositionalValueFacts,
  PositionalGrouping,
} from './algorithm.js';
export {
  positionalValueScene,
  factsOf,
  droppedOf,
  phaseRank,
  POSITIONAL_VALUE_PHASES,
  type PositionalValueScene,
  type PositionalValuePhase,
} from './scene.js';
export { positionalValueIRs } from './irs.js';
export { positionalValueFacet } from './facet.js';
export { positionalValueStageView } from './positional-value-stage.js';

export function registerPositionalValue(): void {
  registerAlgorithm('positionalValue', positionalValueAlgorithm, { mechanismKind: 'reactive' });
  registerScenePlan('positionalValueScene', positionalValueScene);
  for (const ir of positionalValueIRs) registerIR(ir.id, ir);
  registerView('positional-value-stage', positionalValueStageView);
  registerFacets([positionalValueFacet]);
}
