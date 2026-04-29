/**
 * FacetContext — 알고리즘 모듈에 주입되는 컨텍스트.
 *
 * await ctx.emit(event) 이 yield 지점이며, 러너가 UI 처리를 끝낼 때까지 대기.
 * 단계 1은 인터페이스만, 실제 구현은 단계 2.
 *
 * 두 종류의 ctx:
 *   - FacetContext  — coroutine 메커니즘이 주입. 시나리오 자동 재생형 facet.
 *   - ReactiveContext — reactive 메커니즘이 주입. 사용자 입력 반응형 facet.
 *     waitForInput / sleep 으로 외부 신호 대기와 자율 시간 흐름을 표현.
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

/** View 위젯 또는 control-bar facet 고유 버튼이 메커니즘에 보내는 입력 신호. */
export type ReactiveInputEvent = { type: string; payload?: unknown };

/**
 * ReactiveMechanism 이 주입하는 확장 컨텍스트. 입력 반응형 facet 의 algorithm 은
 * 이 타입으로 단언해 사용한다 (registerAlgorithm 시그니처는 FacetContext 그대로).
 */
export type ReactiveContext<TData = unknown> = FacetContext<TData> & {
  /**
   * 다음 사용자 입력 신호 대기. cancelled 가 true 면 reject.
   * pending 입력이 큐에 있으면 즉시 반환.
   */
  waitForInput<T extends ReactiveInputEvent = ReactiveInputEvent>(): Promise<T>;
  /**
   * 자율 시간 흐름 (자동 시연 시퀀스용). cancelled 가 되면 즉시 깨어나 false 반환.
   * speed 슬라이더가 있으면 speedMul 로 나뉘어 가속/감속.
   * @returns 정상 경과 시 true, cancel 로 깨어났으면 false.
   */
  sleep(ms: number): Promise<boolean>;
};

export type AlgorithmFn<TData = unknown> = (ctx: FacetContext<TData>) => Promise<void>;
