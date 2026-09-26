import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { readIsSubscribe } from './algorithm.js';
import { readIsSubscribeScene } from './scene.js';
import { readIsSubscribeIRs } from './irs.js';
import { readIsSubscribeFacet } from './facet.js';
import { readIsSubscribeStageView } from './read-is-subscribe-stage.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './facet.js';
export * from './read-is-subscribe-stage.js';

/** 호스트가 부른다 — index.ts 는 스스로 부르지 않는다. */
export function registerReadIsSubscribe(): void {
  registerAlgorithm('readIsSubscribe', readIsSubscribe, { mechanismKind: 'reactive' });
  registerScenePlan('readIsSubscribeScene', readIsSubscribeScene);
  for (const ir of readIsSubscribeIRs) registerIR(ir.id, ir);
  registerView('read-is-subscribe-stage', readIsSubscribeStageView);
  registerFacets([readIsSubscribeFacet]);
}
