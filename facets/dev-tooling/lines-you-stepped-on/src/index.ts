import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { linesYouSteppedOn, type LinesYouSteppedOnFacetData } from './algorithm.js';
import { linesYouSteppedOnScene } from './scene.js';
import { linesYouSteppedOnStageView } from './lines-you-stepped-on-stage.js';
import { linesYouSteppedOnIRs } from './irs.js';
import { linesYouSteppedOnFacet } from './facet.js';

export {
  linesYouSteppedOn,
  narrowLinesData,
  countedLines,
  callText,
  percentOf,
  runTest,
  type LinesYouSteppedOnFacetData,
} from './algorithm.js';
export { linesYouSteppedOnScene, type LinesScene, type LinesStep } from './scene.js';
export { linesYouSteppedOnStageView } from './lines-you-stepped-on-stage.js';
export { linesYouSteppedOnIRs } from './irs.js';
export { linesYouSteppedOnFacet } from './facet.js';

export function registerLinesYouSteppedOn(): void {
  registerAlgorithm<LinesYouSteppedOnFacetData>('linesYouSteppedOn', linesYouSteppedOn, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('linesYouSteppedOnScene', linesYouSteppedOnScene);
  for (const ir of linesYouSteppedOnIRs) registerIR(ir.id, ir);
  registerView('lines-you-stepped-on-stage', linesYouSteppedOnStageView);
  registerFacets([linesYouSteppedOnFacet]);
}
