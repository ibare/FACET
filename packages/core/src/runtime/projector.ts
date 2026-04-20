/**
 * Projector — 알고리즘 이벤트를 받아 뷰 인스턴스를 직접 조작하는 번역기.
 *
 * 자기 시각화의 모든 시각 갱신 책임. 4-layer 의 2번 layer.
 */

import type { FacetRuntimeEvent } from '../types/event.js';
import type { ViewInstance } from '../views/types.js';

export type ProjectorViews = Record<string, ViewInstance>;

export type ProjectorInstance = {
  onInit?(initialData: unknown): void;
  onEvent(event: FacetRuntimeEvent): void | Promise<void>;
  onReset?(): void;
  onDestroy?(): void;
};

export type ProjectorFactory = (views: ProjectorViews) => ProjectorInstance;
