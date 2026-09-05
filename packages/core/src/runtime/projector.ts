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
   * Projector 가 캡션·상태 메시지처럼 **자기가 문안을 정하는** 텍스트를 View 에
   * 넘길 때 쓴다. View 자신의 고정 라벨은 View 가 `params.locale` 로 만든
   * translator 를 쓰지만 (S-view), Projector 가 사건마다 조립하는 문장은 View 가
   * 알 수 없으므로 여기서 해석해 완성된 문자열로 넘긴다.
   *
   * 이 훅이 없으면 Projector 는 locale 을 알 방법이 없어 문안을 한 언어로
   * 하드코딩하게 된다.
   */
  t: Translate;
};

export type ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
) => ProjectorInstance;
