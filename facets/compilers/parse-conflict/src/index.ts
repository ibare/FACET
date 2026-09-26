import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { parseConflict, type ParseConflictFacetData } from './algorithm.js';
import { parseConflictScene } from './scene.js';
import { parseConflictStageView } from './parse-conflict-stage.js';
import { parseConflictIRs } from './irs.js';
import { parseConflictFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { parseConflictStageView } from './parse-conflict-stage.js';
export { parseConflictIRs } from './irs.js';
export { parseConflictFacet } from './facet.js';

export function registerParseConflict(): void {
  registerAlgorithm<ParseConflictFacetData>('parseConflict', parseConflict, { mechanismKind: 'reactive' });
  registerScenePlan('parseConflictScene', parseConflictScene);
  for (const ir of parseConflictIRs) registerIR(ir.id, ir);
  registerView('parse-conflict-stage', parseConflictStageView);
  registerFacets([parseConflictFacet]);
}
