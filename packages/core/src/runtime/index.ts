/**
 * @facet/core/runtime — 새 4-layer 아키텍처의 진입점.
 *
 * 기존 @facet/core (Container/Body/Lens) 와 분리된 별도 시스템.
 * 두 시스템은 IR/Transpiler 만 공유.
 */

export * from '../types/event.js';
export * from '../types/facet-json.js';
export * from '../types/locale.js';
export * from '../types/ir.js';
export * from './context.js';
export * from './projector.js';
export * from './event-bus.js';
export * from './layout-builder.js';
export * from './registry.js';
export * from './runner.js';

export {
  registerView,
  unregisterView,
  getView,
  listViews,
  clearViewCatalog,
  registerBuiltinViews,
  titleBlockView,
  textDisplayView,
  controlBarView,
  barChartView,
  graphLayoutView,
  treeLayoutView,
  linkedListChainView,
  queueDisplayView,
  conveyorQueueView,
  orderedListView,
  goalPreviewView,
  passTrackerView,
  snapshotStripView,
} from '../views/index.js';
export { colors, lightColors, darkColors, getColors, fonts, fontSizes, radii, space } from '../views/design-tokens.js';
export type { Theme, Palette } from '../views/design-tokens.js';
export type { View, ViewInstance, ViewMountParams } from '../views/types.js';
export type { BarItemState, BarChartFeature } from '../views/bar-chart.js';
export type { GraphData, GraphPositions, GraphNodeState, GraphEdgeState, GraphLayoutFeature } from '../views/graph-layout.js';
export type { QueueDisplayItem } from '../views/queue-display.js';
export type { ConveyorQueueFeature, ConveyorQueueItem } from '../views/conveyor-queue.js';
export type { TreeNode, TreeNodeState, TreeEdgeState } from '../views/tree-layout.js';
export type { LinkedListItemState } from '../views/linked-list-chain.js';
