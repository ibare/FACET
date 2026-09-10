/**
 * @ffacet/algorithm-random-forest — 랜덤 포레스트 완제품 번들.
 *
 * reactive 진행. 마운트하면 나무 열여섯을 하나씩 기르고, 다 자라면 숲 크기
 * 슬라이더 (1 · 2 · 4 · 8 · 16) 를 기다린다. 코드 패널의 IR 은 **예측만**
 * 담는다 — 기르는 셈은 algorithm 이 하고 IR 에는 없다.
 */

export {
  randomForest,
  growRandomForest,
  forestVote,
  leafOfTree,
  fieldOf,
  cellCenter,
  mulberry32,
  type RandomForestData,
  type ForestPoint,
  type FlatTree,
  type TreeStat,
  type FieldStat,
} from './algorithm.js';
export { randomForestProjector } from './projector.js';
export { randomForestVoteIR, randomForestIRs } from './irs.js';
export { randomForestFacet } from './facet.js';
export { randomForestDescription } from './description.js';
export { randomForestStageView } from './random-forest-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { randomForest, type RandomForestData } from './algorithm.js';
import { randomForestProjector } from './projector.js';
import { randomForestIRs } from './irs.js';
import { randomForestFacet } from './facet.js';
import { randomForestDescription } from './description.js';
import { randomForestStageView } from './random-forest-stage.js';

export function registerRandomForest(): void {
  registerAlgorithm<RandomForestData>('randomForest', randomForest, {
    mechanismKind: 'reactive',
  });
  registerProjector('randomForestProjector', randomForestProjector);
  for (const ir of randomForestIRs) registerIR(ir.id, ir);
  registerView('random-forest-stage', randomForestStageView);
  registerFacets([randomForestFacet]);
  registerDescription(randomForestFacet.id, randomForestDescription);
}
