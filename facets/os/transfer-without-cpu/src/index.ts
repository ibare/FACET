import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { transferWithoutCpu, type TransferWithoutCpuFacetData } from './algorithm';
import { transferWithoutCpuScene } from './scene';
import { transferWithoutCpuStageView } from './transfer-without-cpu-stage';
import { transferWithoutCpuIRs } from './irs';
import { transferWithoutCpuFacet } from './facet';

export { transferWithoutCpu, readTransferData } from './algorithm';
export type { TransferWithoutCpuFacetData, TransferDirection } from './algorithm';
export { transferWithoutCpuScene } from './scene';
export type { TransferScene, TransferStep } from './scene';
export { transferWithoutCpuStageView } from './transfer-without-cpu-stage';
export { transferWithoutCpuIRs } from './irs';
export { transferWithoutCpuFacet } from './facet';

export function registerTransferWithoutCpu(): void {
  registerAlgorithm<TransferWithoutCpuFacetData>('transferWithoutCpu', transferWithoutCpu, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('transferWithoutCpuScene', transferWithoutCpuScene);
  for (const ir of transferWithoutCpuIRs) registerIR(ir.id, ir);
  registerView('transfer-without-cpu-stage', transferWithoutCpuStageView);
  registerFacets([transferWithoutCpuFacet]);
}
