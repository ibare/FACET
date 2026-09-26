import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { linkerAlgorithm, type LinkerData } from './algorithm.js';
import { linkerProjector } from './projector.js';
import { linkerIRs } from './irs.js';
import { linkerStageView } from './linker-stage.js';
import { linkerFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './linker-stage.js';
export * from './facet.js';

/** 링커 완제품 등록 — 손잡이가 있으므로 reactive */
export function registerLinker(): void {
  registerAlgorithm<LinkerData>('linker', linkerAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('linkerProjector', linkerProjector);
  for (const ir of linkerIRs) registerIR(ir.id, ir);
  registerView('linker-stage', linkerStageView);
  registerFacets([linkerFacet]);
}
