/**
 * View Catalog — 이름→View 생성자 맵.
 * @facet/core 에 내장된 표준 뷰들을 자동 등록.
 */

import type { View, ViewInstance, ViewMountParams } from './types.js';
import { titleBlockView } from './title-block.js';
import { textDisplayView } from './text-display.js';
import { controlBarView } from './control-bar.js';
import { barChartView } from './bar-chart.js';
import { graphLayoutView } from './graph-layout.js';
import { treeLayoutView } from './tree-layout.js';
import { linkedListChainView } from './linked-list-chain.js';
import { queueDisplayView } from './queue-display.js';
import { conveyorQueueView } from './conveyor-queue.js';
import { orderedListView } from './ordered-list.js';
import { goalPreviewView } from './goal-preview.js';
import { passTrackerView } from './pass-tracker.js';
import { snapshotStripView } from './snapshot-strip.js';

const globalViewCatalog = new Map<string, View>();

export function registerView(name: string, view: View): void {
  globalViewCatalog.set(name, view);
}

export function unregisterView(name: string): void {
  globalViewCatalog.delete(name);
}

export function getView(name: string): View | undefined {
  return globalViewCatalog.get(name);
}

export function listViews(): string[] {
  return [...globalViewCatalog.keys()];
}

export function clearViewCatalog(): void {
  globalViewCatalog.clear();
}

export function registerBuiltinViews(): void {
  registerView('title-block', titleBlockView);
  registerView('text-display', textDisplayView);
  registerView('control-bar', controlBarView);
  registerView('bar-chart', barChartView);
  registerView('graph-layout', graphLayoutView);
  registerView('tree-layout', treeLayoutView);
  registerView('linked-list-chain', linkedListChainView);
  registerView('queue-display', queueDisplayView);
  registerView('conveyor-queue', conveyorQueueView);
  registerView('ordered-list', orderedListView);
  registerView('goal-preview', goalPreviewView);
  registerView('pass-tracker', passTrackerView);
  registerView('snapshot-strip', snapshotStripView);
}

// 기본 뷰는 import 시 자동 등록
registerBuiltinViews();

export type { View, ViewInstance, ViewMountParams };
export {
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
};
