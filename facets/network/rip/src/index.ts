import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { ripAlgorithm, type RipData } from './algorithm';
import { ripProjector } from './projector';
import { ripIRs } from './irs';
import { ripStageView } from './rip-stage';
import { ripFacet } from './facet';

export { ripAlgorithm, playRip } from './algorithm';
export type { RipData, RipPlay, RipRound, RipRow, RipAdvert, RipMethod } from './algorithm';
export { ripProjector } from './projector';
export { ripIRs } from './irs';
export { ripStageView } from './rip-stage';
export type { RipStage } from './rip-stage';
export { ripFacet } from './facet';

export function registerRip(): void {
  registerAlgorithm<RipData>('rip', ripAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('ripProjector', ripProjector);
  for (const ir of ripIRs) registerIR(ir.id, ir);
  registerView('rip-stage', ripStageView);
  registerFacets([ripFacet]);
}
