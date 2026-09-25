import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { echoAndReply, type EchoAndReplyFacetData } from './algorithm.js';
import { echoAndReplyScene } from './scene.js';
import { echoAndReplyStageView } from './echo-and-reply-stage.js';
import { echoAndReplyIRs } from './irs.js';
import { echoAndReplyFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './echo-and-reply-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerEchoAndReply(): void {
  registerAlgorithm<EchoAndReplyFacetData>('echoAndReply', echoAndReply, { mechanismKind: 'reactive' });
  registerScenePlan('echoAndReplyScene', echoAndReplyScene);
  for (const ir of echoAndReplyIRs) registerIR(ir.id, ir);
  registerView('echo-and-reply-stage', echoAndReplyStageView);
  registerFacets([echoAndReplyFacet]);
}
