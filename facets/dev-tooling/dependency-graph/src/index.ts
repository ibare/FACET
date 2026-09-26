import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { dependencyGraphAlgorithm, type DependencyGraphData } from './algorithm.js';
import { dependencyGraphFacet } from './facet.js';
import { dependencyGraphIRs } from './irs.js';
import { dependencyGraphProjector } from './projector.js';
import { dependencyGraphStageView } from './dependency-graph-stage.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './dependency-graph-stage.js';
export * from './facet.js';

/** 의존 그래프 facet 을 등록한다. 부르는 것은 호스트의 몫이다. */
export function registerDependencyGraph(): void {
  registerAlgorithm<DependencyGraphData>('dependencyGraph', dependencyGraphAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('dependencyGraphProjector', dependencyGraphProjector);
  for (const ir of dependencyGraphIRs) registerIR(ir.id, ir);
  registerView('dependency-graph-stage', dependencyGraphStageView);
  registerFacets([dependencyGraphFacet]);
}
