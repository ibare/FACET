import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { parserStops } from './algorithm.js';
import { parserStopsScene } from './scene.js';
import { parserStopsIRs } from './irs.js';
import { parserStopsFacet } from './facet.js';
import { parserStopsStageView } from './parser-stops-stage.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './facet.js';
export * from './parser-stops-stage.js';

export function registerParserStops(): void {
  registerAlgorithm('parserStops', parserStops, { mechanismKind: 'reactive' });
  registerScenePlan('parserStopsScene', parserStopsScene);
  for (const ir of parserStopsIRs) registerIR(ir.id, ir);
  registerView('parser-stops-stage', parserStopsStageView);
  registerFacets([parserStopsFacet]);
}
