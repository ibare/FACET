import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { virtualMemoryAlgorithm, type VirtualMemoryData } from './algorithm.js';
import { virtualMemoryProjector } from './projector.js';
import { virtualMemoryIRs } from './irs.js';
import { virtualMemoryStageView } from './virtual-memory-stage.js';
import { virtualMemoryFacet } from './facet.js';

export {
  virtualMemoryAlgorithm,
  simulateVirtualMemory,
  utilizationCurve,
  percent,
  type VirtualMemoryData,
  type VmChunk,
  type VmRun,
  type CpuTick,
  type FrameLoad,
} from './algorithm.js';
export { virtualMemoryProjector } from './projector.js';
export { virtualMemoryIRs } from './irs.js';
export { virtualMemoryStageView } from './virtual-memory-stage.js';
export { virtualMemoryFacet } from './facet.js';

export function registerVirtualMemory(): void {
  registerAlgorithm<VirtualMemoryData>('virtualMemory', virtualMemoryAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('virtualMemoryProjector', virtualMemoryProjector);
  for (const ir of virtualMemoryIRs) registerIR(ir.id, ir);
  registerView('virtual-memory-stage', virtualMemoryStageView);
  registerFacets([virtualMemoryFacet]);
}
