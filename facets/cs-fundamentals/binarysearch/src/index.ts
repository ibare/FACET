export { binarysearch, type BinarySearchData } from './algorithm.js';
export { binarysearchProjector } from './projector.js';
export { binarysearchImperativeIR, binarysearchIRs } from './irs.js';
export { binarysearchFacet } from './facet.js';
export { binarysearchDescription } from './description.js';

import {
  registerAlgorithm,
  registerProjector,
  registerFacets,
  registerIR,
  registerDescription,
} from '@facet/core/runtime';
import { binarysearch, type BinarySearchData } from './algorithm.js';
import { binarysearchProjector } from './projector.js';
import { binarysearchIRs } from './irs.js';
import { binarysearchFacet } from './facet.js';
import { binarysearchDescription } from './description.js';

export function registerBinarysearch(): void {
  registerAlgorithm<BinarySearchData>('binarysearch', async (ctx) => {
    await binarysearch(ctx);
  });
  registerProjector('binarysearchProjector', binarysearchProjector);
  for (const ir of binarysearchIRs) registerIR(ir.id, ir);
  registerFacets([binarysearchFacet]);
  registerDescription(binarysearchFacet.id, binarysearchDescription);
}
