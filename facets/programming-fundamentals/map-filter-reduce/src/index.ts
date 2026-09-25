/**
 * map-filter-reduce — 세 단계가 각자 한 가지만 바꾼다.
 *
 * `registerMapFilterReduce()` 는 호스트가 부른다. 문턱 손잡이를 받으므로 reactive 로 등록한다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { mapFilterReduceAlgorithm, type MapFilterReduceData } from './algorithm.js';
import { mapFilterReduceFacet } from './facet.js';
import { mapFilterReduceIRs } from './irs.js';
import { mapFilterReduceStageView } from './map-filter-reduce-stage.js';
import { mapFilterReduceProjector } from './projector.js';

export { mapFilterReduceAlgorithm, pipeline, readData } from './algorithm.js';
export type { MapFilterReduceData, PipelineResult } from './algorithm.js';
export { mapFilterReduceProjector } from './projector.js';
export { mapFilterReduceImperativeIR, mapFilterReduceIRs } from './irs.js';
export { mapFilterReduceStageView } from './map-filter-reduce-stage.js';
export type { MapFilterReduceStage } from './map-filter-reduce-stage.js';
export { mapFilterReduceFacet } from './facet.js';

export function registerMapFilterReduce(): void {
  registerAlgorithm<MapFilterReduceData>('mapFilterReduce', mapFilterReduceAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('mapFilterReduceProjector', mapFilterReduceProjector);
  for (const ir of mapFilterReduceIRs) registerIR(ir.id, ir);
  registerView('map-filter-reduce-stage', mapFilterReduceStageView);
  registerFacets([mapFilterReduceFacet]);
}
