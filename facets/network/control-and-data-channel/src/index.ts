import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { controlAndDataChannel, type ControlAndDataChannelFacetData } from './algorithm.js';
import { controlAndDataChannelScene } from './scene.js';
import { controlAndDataChannelStageView } from './control-and-data-channel-stage.js';
import { controlAndDataChannelIRs } from './irs.js';
import { controlAndDataChannelFacet } from './facet.js';

export {
  controlAndDataChannel,
  type ControlAndDataChannelFacetData,
  type Cargo,
  type FtpCommand,
  type FtpFile,
} from './algorithm.js';
export {
  controlAndDataChannelScene,
  type ControlAndDataChannelScene,
  type DataLane,
  type Arrival,
  type ChannelStep,
} from './scene.js';
export { controlAndDataChannelStageView } from './control-and-data-channel-stage.js';
export { controlAndDataChannelIRs } from './irs.js';
export { controlAndDataChannelFacet } from './facet.js';

export function registerControlAndDataChannel(): void {
  registerAlgorithm<ControlAndDataChannelFacetData>('controlAndDataChannel', controlAndDataChannel, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('controlAndDataChannelScene', controlAndDataChannelScene);
  for (const ir of controlAndDataChannelIRs) registerIR(ir.id, ir);
  registerView('control-and-data-channel-stage', controlAndDataChannelStageView);
  registerFacets([controlAndDataChannelFacet]);
}
