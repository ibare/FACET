/**
 * Projector — 알고리즘 이벤트를 받아 뷰 인스턴스를 직접 조작하는 번역기.
 *
 * 자기 시각화의 모든 시각 갱신 책임. 4-layer 의 2번 layer.
 */

import type { FacetRuntimeEvent } from '../types/event.js';
import type { ViewInstance } from '../views/types.js';
import type { Translate } from './i18n.js';

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
  /**
   * 메시지 카탈로그 조회 (`i18n.ts`).
   *
   * Projector 가 캡션·상태 메시지를 View 에 넘길 때 쓴다. 러너가 만든 조회기를
   * 그대로 받으므로 `FacetJson.messages` 오버라이드가 이미 얹혀 있다 — View 가
   * 쓰는 `ViewMountParams.t` 와 같은 인스턴스라, 한 facet 안에서 문안 출처가
   * 갈리지 않는다 (S-runtime).
   *
   * 문안 자체는 `FacetJson.messages` 에 있고 코드에는 키와 en 원본만 남는다 (C10).
   */
  t: Translate;
};

export type ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
) => ProjectorInstance;
