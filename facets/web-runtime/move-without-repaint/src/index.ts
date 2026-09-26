import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { moveWithoutRepaint } from './algorithm.js';
import { moveWithoutRepaintFacet } from './facet.js';
import { moveWithoutRepaintIRs } from './irs.js';
import { moveWithoutRepaintScene } from './scene.js';
import { moveWithoutRepaintStageView } from './move-without-repaint-stage.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './move-without-repaint-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerMoveWithoutRepaint(): void {
  registerAlgorithm('moveWithoutRepaint', moveWithoutRepaint, { mechanismKind: 'reactive' });
  registerScenePlan('moveWithoutRepaintScene', moveWithoutRepaintScene);
  for (const ir of moveWithoutRepaintIRs) registerIR(ir.id, ir);
  registerView('move-without-repaint-stage', moveWithoutRepaintStageView);
  registerFacets([moveWithoutRepaintFacet]);
}
