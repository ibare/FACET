/**
 * 알고리즘 → Projector 이벤트 라우팅.
 *
 * 기존 src/event-bus.ts 와는 별도 (서로 다른 시스템).
 * 단방향: 알고리즘이 emit, Projector 의 onEvent 단일 핸들러로 라우팅.
 */

import type { FacetRuntimeEvent } from '../types/event.js';

export type EventRouterHandler = (event: FacetRuntimeEvent) => void | Promise<void>;

export class EventRouter {
  private handler: EventRouterHandler | null = null;

  setHandler(handler: EventRouterHandler | null): void {
    this.handler = handler;
  }

  async route(event: FacetRuntimeEvent): Promise<void> {
    if (!this.handler) return;
    await this.handler(event);
  }

  clear(): void {
    this.handler = null;
  }
}
