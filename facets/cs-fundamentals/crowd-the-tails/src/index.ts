import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { crowdTheTailsAlgorithm, type CrowdTheTailsData } from './algorithm.js';
import { crowdTheTailsProjector } from './projector.js';
import { crowdTheTailsIRs } from './irs.js';
import { crowdTheTailsStageView } from './crowd-the-tails-stage.js';
import { crowdTheTailsFacet } from './facet.js';
import { crowdTheTailsDescription } from './description.js';

/** 호스트 앱이 부른다. import 부수효과로 스스로 부르지 않는다 (S-facet). */
export function registerCrowdTheTails(): void {
  registerAlgorithm<CrowdTheTailsData>('crowdTheTails', crowdTheTailsAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('crowdTheTailsProjector', crowdTheTailsProjector);
  for (const ir of crowdTheTailsIRs) registerIR(ir.id, ir);
  registerView('crowd-the-tails-stage', crowdTheTailsStageView);
  registerFacets([crowdTheTailsFacet]);
  registerDescription(crowdTheTailsFacet.id, crowdTheTailsDescription);
}

export {
  crowdTheTailsAlgorithm,
  crowdTheTailsProjector,
  crowdTheTailsIRs,
  crowdTheTailsStageView,
  crowdTheTailsFacet,
  crowdTheTailsDescription,
};
export type { CrowdTheTailsData };
