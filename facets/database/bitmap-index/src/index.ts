import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { bitmapIndexAlgorithm, type BitmapIndexData } from './algorithm.js';
import { bitmapIndexProjector } from './projector.js';
import { bitmapIndexIRs } from './irs.js';
import { bitmapIndexStageView } from './bitmap-index-stage.js';
import { bitmapIndexFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './bitmap-index-stage.js';
export * from './facet.js';

export function registerBitmapIndex(): void {
  registerAlgorithm<BitmapIndexData>('bitmapIndex', bitmapIndexAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('bitmapIndexProjector', bitmapIndexProjector);
  for (const ir of bitmapIndexIRs) registerIR(ir.id, ir);
  registerView('bitmap-index-stage', bitmapIndexStageView);
  registerFacets([bitmapIndexFacet]);
}
