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

/**
 * Projector 가 런타임 상태를 참조해야 할 때 사용하는 훅.
 * 예: 시각 애니메이션 길이를 현재 재생 속도에 비례시키기 위해 getSpeed() 사용.
 */
export type ProjectorRuntime = {
  /** 현재 재생 속도 배수 (1 = 100ms/스텝). */
  getSpeed(): number;
};

export type ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
) => ProjectorInstance;
