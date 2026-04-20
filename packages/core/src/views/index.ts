/**
 * View Catalog — 이름→View 생성자 맵.
 * 단계 1에서는 등록 API 만, 실제 뷰 구현은 단계 2/3.
 */

import type { View, ViewInstance, ViewMountParams } from './types.js';

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

export type { View, ViewInstance, ViewMountParams };
