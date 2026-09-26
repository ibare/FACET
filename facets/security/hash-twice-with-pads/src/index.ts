import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { hashTwiceWithPads, type HashTwiceWithPadsFacetData } from './algorithm.js';
import { hashTwiceWithPadsScene } from './scene.js';
import { hashTwiceWithPadsIRs } from './irs.js';
import { hashTwiceWithPadsStageView } from './hash-twice-with-pads-stage.js';
import { hashTwiceWithPadsFacet } from './facet.js';

export {
  hashTwiceWithPads,
  narrowHashTwiceData,
  messageBytes,
  wordBytes,
  toyHash,
  type HashTwiceWithPadsFacetData,
} from './algorithm.js';
export { hashTwiceWithPadsScene, type HashTwiceScene, type HashTwiceStep } from './scene.js';
export { hashTwiceWithPadsIRs } from './irs.js';
export { hashTwiceWithPadsStageView } from './hash-twice-with-pads-stage.js';
export { hashTwiceWithPadsFacet } from './facet.js';

export function registerHashTwiceWithPads(): void {
  registerAlgorithm<HashTwiceWithPadsFacetData>('hashTwiceWithPads', hashTwiceWithPads, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('hashTwiceWithPadsScene', hashTwiceWithPadsScene);
  for (const ir of hashTwiceWithPadsIRs) registerIR(ir.id, ir);
  registerView('hash-twice-with-pads-stage', hashTwiceWithPadsStageView);
  registerFacets([hashTwiceWithPadsFacet]);
}
