/**
 * index-choice — 인덱스와 질의 꼴. 등록은 호스트가 `registerIndexChoice()` 로 한다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { indexChoiceAlgorithm, type IndexChoiceData } from './algorithm.js';
import { indexChoiceProjector } from './projector.js';
import { indexChoiceIRs } from './irs.js';
import { indexChoiceStageView } from './index-choice-stage.js';
import { indexChoiceFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './index-choice-stage.js';
export * from './facet.js';

export function registerIndexChoice(): void {
  registerAlgorithm<IndexChoiceData>('indexChoice', indexChoiceAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('indexChoiceProjector', indexChoiceProjector);
  for (const ir of indexChoiceIRs) registerIR(ir.id, ir);
  registerView('index-choice-stage', indexChoiceStageView);
  registerFacets([indexChoiceFacet]);
}
