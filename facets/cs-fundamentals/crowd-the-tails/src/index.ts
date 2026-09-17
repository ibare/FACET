/**
 * @ffacet/algorithm-crowd-the-tails — 분위수를 재는 그릇이 자리를 나누는 법 (조각).
 *
 * algorithm / scene / IR / facet JSON / description / 전용 stage view 를 담고
 * 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { crowdTheTailsAlgorithm, type CrowdTheTailsData } from './algorithm.js';
import { crowdTheTailsScene } from './scene.js';
import { crowdTheTailsIRs } from './irs.js';
import { crowdTheTailsStageView } from './crowd-the-tails-stage.js';
import { crowdTheTailsFacet } from './facet.js';
import { crowdTheTailsDescription } from './description.js';

/** 호스트 앱이 부른다. import 부수효과로 스스로 부르지 않는다 (S-facet). */
export function registerCrowdTheTails(): void {
  registerAlgorithm<CrowdTheTailsData>('crowdTheTails', crowdTheTailsAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('crowdTheTailsScene', crowdTheTailsScene);
  for (const ir of crowdTheTailsIRs) registerIR(ir.id, ir);
  registerView('crowd-the-tails-stage', crowdTheTailsStageView);
  registerFacets([crowdTheTailsFacet]);
  registerDescription(crowdTheTailsFacet.id, crowdTheTailsDescription);
}

export {
  crowdTheTailsAlgorithm,
  crowdTheTailsScene,
  crowdTheTailsIRs,
  crowdTheTailsStageView,
  crowdTheTailsFacet,
  crowdTheTailsDescription,
};
export type { CrowdTheTailsData };
export type { CrowdTheTailsScene, CrowdStep, CutKind } from './scene.js';
