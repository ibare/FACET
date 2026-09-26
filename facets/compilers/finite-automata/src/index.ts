/**
 * finite-automata — 등록 진입점. 호스트가 registerFiniteAutomata() 를 부른다 (스스로 부르지 않는다).
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { finiteAutomataAlgorithm, type FiniteAutomataData } from './algorithm.js';
import { finiteAutomataProjector } from './projector.js';
import { finiteAutomataIRs } from './irs.js';
import { finiteAutomataStageView } from './finite-automata-stage.js';
import { finiteAutomataFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './finite-automata-stage.js';
export * from './facet.js';

export function registerFiniteAutomata(): void {
  registerAlgorithm<FiniteAutomataData>('finiteAutomata', finiteAutomataAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('finiteAutomataProjector', finiteAutomataProjector);
  for (const ir of finiteAutomataIRs) registerIR(ir.id, ir);
  registerView('finite-automata-stage', finiteAutomataStageView);
  registerFacets([finiteAutomataFacet]);
}
