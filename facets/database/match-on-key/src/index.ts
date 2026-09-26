import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { matchOnKey } from './algorithm.js';
import type { MatchOnKeyFacetData } from './algorithm.js';
import { matchOnKeyFacet } from './facet.js';
import { matchOnKeyIRs } from './irs.js';
import { matchOnKeyStageView } from './match-on-key-stage.js';
import { matchOnKeyScene } from './scene.js';

export { matchOnKey, readMatchOnKeyData, resolveColumns } from './algorithm.js';
export type { Cell, MatchOnKeyFacetData, ResolvedColumns, TableData } from './algorithm.js';
export { matchOnKeyScene } from './scene.js';
export type { MatchOnKeyScene, MatchStep, ResultRow } from './scene.js';
export { matchOnKeyStageView } from './match-on-key-stage.js';
export { matchOnKeyIRs } from './irs.js';
export { matchOnKeyFacet } from './facet.js';

export function registerMatchOnKey(): void {
  registerAlgorithm<MatchOnKeyFacetData>('matchOnKey', matchOnKey, { mechanismKind: 'reactive' });
  registerScenePlan('matchOnKeyScene', matchOnKeyScene);
  for (const ir of matchOnKeyIRs) registerIR(ir.id, ir);
  registerView('match-on-key-stage', matchOnKeyStageView);
  registerFacets([matchOnKeyFacet]);
}
