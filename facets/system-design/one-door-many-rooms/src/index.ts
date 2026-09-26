import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { oneDoorManyRooms, type OneDoorManyRoomsFacetData } from './algorithm.js';
import { oneDoorManyRoomsScene } from './scene.js';
import { oneDoorManyRoomsStageView } from './one-door-many-rooms-stage.js';
import { oneDoorManyRoomsIRs } from './irs.js';
import { oneDoorManyRoomsFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { oneDoorManyRoomsStageView } from './one-door-many-rooms-stage.js';
export { oneDoorManyRoomsIRs } from './irs.js';
export { oneDoorManyRoomsFacet } from './facet.js';

export function registerOneDoorManyRooms(): void {
  registerAlgorithm<OneDoorManyRoomsFacetData>('oneDoorManyRooms', oneDoorManyRooms, { mechanismKind: 'reactive' });
  registerScenePlan('oneDoorManyRoomsScene', oneDoorManyRoomsScene);
  for (const ir of oneDoorManyRoomsIRs) registerIR(ir.id, ir);
  registerView('one-door-many-rooms-stage', oneDoorManyRoomsStageView);
  registerFacets([oneDoorManyRoomsFacet]);
}
