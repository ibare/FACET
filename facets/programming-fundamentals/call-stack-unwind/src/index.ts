import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { callStackUnwind } from './algorithm.js';
import type { CallStackUnwindFacetData } from './algorithm.js';
import { callStackUnwindScene } from './scene.js';
import { callStackUnwindStageView } from './call-stack-unwind-stage.js';
import { callStackUnwindIRs } from './irs.js';
import { callStackUnwindFacet } from './facet.js';

export { callStackUnwind, traceCalls } from './algorithm.js';
export type {
  CallStackUnwindFacetData,
  CallEvent,
  CallTrace,
  CodeLine,
  Expr,
  Stmt,
  Value,
} from './algorithm.js';
export { callStackUnwindScene } from './scene.js';
export type {
  CallStackUnwindScene,
  CallStackUnwindStep,
  FrameScene,
  OuterScene,
  Slot,
} from './scene.js';
export { callStackUnwindStageView } from './call-stack-unwind-stage.js';
export { callStackUnwindIRs } from './irs.js';
export { callStackUnwindFacet } from './facet.js';

export function registerCallStackUnwind(): void {
  registerAlgorithm<CallStackUnwindFacetData>('callStackUnwind', callStackUnwind, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('callStackUnwindScene', callStackUnwindScene);
  for (const ir of callStackUnwindIRs) registerIR(ir.id, ir);
  registerView('call-stack-unwind-stage', callStackUnwindStageView);
  registerFacets([callStackUnwindFacet]);
}
