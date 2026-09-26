import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { happensBefore, type HappensBeforeFacetData } from './algorithm.js';
import { happensBeforeScene } from './scene.js';
import { happensBeforeStageView } from './happens-before-stage.js';
import { happensBeforeIRs } from './irs.js';
import { happensBeforeFacet } from './facet.js';

export {
  happensBefore,
  narrowHappensBeforeData,
  lamportRun,
  happensBeforeEdges,
  findPath,
  type HappensBeforeFacetData,
  type HbEventDef,
  type HbEventKind,
  type LamportStep,
} from './algorithm.js';
export {
  happensBeforeScene,
  type HappensBeforeScene,
  type HbStep,
  type HbAsk,
  type HbMessage,
  type HbPlaced,
} from './scene.js';
export { happensBeforeStageView } from './happens-before-stage.js';
export { happensBeforeIRs } from './irs.js';
export { happensBeforeFacet } from './facet.js';

export function registerHappensBefore(): void {
  registerAlgorithm<HappensBeforeFacetData>('happensBefore', happensBefore, { mechanismKind: 'reactive' });
  registerScenePlan('happensBeforeScene', happensBeforeScene);
  for (const ir of happensBeforeIRs) registerIR(ir.id, ir);
  registerView('happens-before-stage', happensBeforeStageView);
  registerFacets([happensBeforeFacet]);
}
