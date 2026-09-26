import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { tablePerScope } from './algorithm.js';
import type { TablePerScopeFacetData } from './algorithm.js';
import { tablePerScopeFacet } from './facet.js';
import { tablePerScopeIRs } from './irs.js';
import { tablePerScopeScene } from './scene.js';
import { tablePerScopeStageView } from './table-per-scope-stage.js';

export { tablePerScope } from './algorithm.js';
export type { TablePerScopeFacetData, ProgramLine, Stmt, Expr } from './algorithm.js';
export { tablePerScopeScene } from './scene.js';
export type { TablePerScopeScene, ScopeTable, TableRow, TableStep, SceneLine } from './scene.js';
export { tablePerScopeStageView } from './table-per-scope-stage.js';
export { tablePerScopeIRs } from './irs.js';
export { tablePerScopeFacet } from './facet.js';

/** 이 조각을 레지스트리에 올린다. 부르는 것은 호스트 몫이다. */
export function registerTablePerScope(): void {
  registerAlgorithm<TablePerScopeFacetData>('tablePerScope', tablePerScope, { mechanismKind: 'reactive' });
  registerScenePlan('tablePerScopeScene', tablePerScopeScene);
  for (const ir of tablePerScopeIRs) registerIR(ir.id, ir);
  registerView('table-per-scope-stage', tablePerScopeStageView);
  registerFacets([tablePerScopeFacet]);
}
