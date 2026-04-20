/**
 * FacetContext — 알고리즘 모듈에 주입되는 컨텍스트.
 *
 * await ctx.emit(event) 이 yield 지점이며, 러너가 UI 처리를 끝낼 때까지 대기.
 * 단계 1은 인터페이스만, 실제 구현은 단계 2.
 */

import type { FacetRuntimeEvent } from '../types/event.js';

export type MetricDelta = number | 'inc';

export type FacetContext<TData = unknown> = {
  data: TData;
  emit(event: FacetRuntimeEvent): Promise<void>;
  metric(name: string, delta: MetricDelta): void;
  /** 정지/리셋 시 true. 알고리즘은 주기적으로 검사해 조기 종료. */
  readonly cancelled: boolean;
};

export type AlgorithmFn<TData = unknown> = (ctx: FacetContext<TData>) => Promise<void>;
