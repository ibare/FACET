import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { peerLayerTalk, type PeerLayerTalkFacetData } from './algorithm';
import { peerLayerTalkScene } from './scene';
import { peerLayerTalkStageView } from './peer-layer-talk-stage';
import { peerLayerTalkIRs } from './irs';
import { peerLayerTalkFacet } from './facet';

export * from './algorithm';
export * from './scene';
export * from './peer-layer-talk-stage';
export * from './irs';
export * from './facet';

export function registerPeerLayerTalk(): void {
  registerAlgorithm<PeerLayerTalkFacetData>('peerLayerTalk', peerLayerTalk, { mechanismKind: 'reactive' });
  registerScenePlan('peerLayerTalkScene', peerLayerTalkScene);
  for (const ir of peerLayerTalkIRs) registerIR(ir.id, ir);
  registerView('peer-layer-talk-stage', peerLayerTalkStageView);
  registerFacets([peerLayerTalkFacet]);
}
