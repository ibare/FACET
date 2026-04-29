/**
 * Mechanism — 시각화의 진행 메커니즘 추상.
 *
 * 현재는 알고리즘 코루틴(async function(ctx)) 동작 한 종류만 정식 구현되어 있고,
 * 미래의 다른 시각화 type(concept, protocol, dataStructure 등) 이 자기에게 맞는
 * 메커니즘으로 들어올 자리를 마련한다.
 *
 * 핵심 규약:
 * - ctx 는 메커니즘 내부에서 생성·보유한다. 외부에 노출하지 않는다.
 *   외부(러너)는 projector 와 initialData 만 안다.
 * - 컨트롤바 클릭은 onControl(action, payload) 로, View 위젯 사용자 입력은
 *   dispatch(event) 로 직교 분리한다.
 * - supportedControls 는 메커니즘이 받는 컨트롤 액션 어휘. JSON 의
 *   controls[].action 과 매칭해 호환성 검증.
 *
 * 새 메커니즘 추가 방법 (요약):
 *  1. MechanismKind union 에 새 literal 추가 (예: 'reactive' | 'sequence').
 *  2. Mechanism 인터페이스를 구현하는 클래스 작성. ctx 가 필요하면 자체 보유.
 *  3. supportedControls 에 control-bar 에서 받을 액션 어휘 선언.
 *  4. dispatch(event) 로 View 위젯의 사용자 입력 처리.
 *  5. runner.ts 가 algorithm 모듈을 어떤 메커니즘으로 감쌀지 판정 — 현재는
 *     CoroutineMechanism 만 정식 지원하므로 새 type 도입 시 분기 추가.
 */

import type { ProjectorInstance } from './projector.js';
import type { FacetContext, MetricDelta, ReactiveContext, ReactiveInputEvent } from './context.js';
import type { FacetRuntimeEvent } from '../types/event.js';

/** 메커니즘 식별 — 새 메커니즘 추가 시 union 에 등록. */
export type MechanismKind = 'coroutine' | 'reactive';

/** 메커니즘이 외부(러너)로 발행하는 신호. */
export type MechanismHooks = {
  /** 진행/정지 상태 전이 (control-bar 의 setRunning 동기화용). */
  onRunningChange?(running: boolean): void;
  /** 알고리즘이 끝까지 완주했는지 (control-bar 의 setComplete 동기화용). */
  onComplete?(complete: boolean): void;
  /** ctx.metric 갱신 결과를 외부에 알림. */
  onMetric?(name: string, value: number): void;
  /** reset 시 외부의 metric 표시도 초기값으로 복원하라는 신호. */
  onMetricsReset?(): void;
};

/** init 시 외부가 주입하는 옵션. */
export type MechanismInitOptions = {
  /** true 면 mount 시점과 reset 시점 모두 initialData 의 최상위 배열 필드를 셔플. */
  shuffleOnReset?: boolean;
  hooks?: MechanismHooks;
};

/** View 위젯 → 메커니즘 사용자 입력 채널의 페이로드. */
export type MechanismDispatchEvent = { type: string; payload?: unknown };

export interface Mechanism {
  readonly kind: MechanismKind;
  /** 이 메커니즘이 받는 컨트롤 액션 어휘. control-bar 의 controls[].action 과 매칭. */
  readonly supportedControls: readonly string[];

  init(projector: ProjectorInstance, initialData: unknown, opts?: MechanismInitOptions): void;
  start(): void;
  stop(): void;
  step(): void;
  reset(): Promise<void>;
  destroy(): void;

  /** control-bar 액션 라우팅 (play/pause/step/reset/speed). */
  onControl(action: string, payload?: unknown): void;
  /** View 사용자 입력 채널. CoroutineMechanism 은 no-op. */
  dispatch(event: MechanismDispatchEvent): void;

  getSpeed(): number;
  setSpeed(mul: number): void;
}

const BASE_DELAY_MS = 100;
type Mode = 'idle' | 'playing' | 'paused' | 'stepping';

export type CoroutineFn = (ctx: FacetContext) => Promise<void>;

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * initialData 의 최상위 배열 필드를 Fisher-Yates 로 in-place 셔플.
 * 객체/원시값은 건드리지 않는다.
 */
function shuffleArrayFields(obj: Record<string, unknown>): void {
  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) {
      for (let i = v.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [v[i], v[j]] = [v[j], v[i]];
      }
    }
  }
}

/**
 * 코루틴(async function(ctx)) 을 감싸는 메커니즘. 현재 모든 알고리즘 facet 의
 * 진행 동력. 내부 상태(mode/cancelled/runId/activePromise/stepResolve/timer/speed) 는
 * 모두 클래스 멤버로 캡슐화되며, ctx 도 자체 생성·보유한다.
 */
export class CoroutineMechanism implements Mechanism {
  readonly kind = 'coroutine' as const;
  readonly supportedControls = ['play', 'pause', 'step', 'reset', 'speed'] as const;

  private projector: ProjectorInstance | null = null;
  private hooks: MechanismHooks = {};
  private shuffleOnReset = false;
  private originalInitial: unknown = undefined;
  /** ctx.data 가 가리키는 객체. reset 시 in-place 갱신해 참조 유지. */
  private dataRef: Record<string, unknown> = {};
  private ctx: FacetContext | null = null;

  private mode: Mode = 'idle';
  private speedMul = 1;
  private cancelled = false;
  private runId = 0;
  private activePromise: Promise<void> | null = null;
  private stepResolve: (() => void) | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingTimerResolve: (() => void) | null = null;
  private metricsState = new Map<string, number>();

  constructor(private readonly coroutineFn: CoroutineFn) {}

  init(projector: ProjectorInstance, initialData: unknown, opts?: MechanismInitOptions): void {
    this.projector = projector;
    this.hooks = opts?.hooks ?? {};
    this.shuffleOnReset = opts?.shuffleOnReset ?? false;
    // initialData 는 외부에서 이미 clone 된 채로 들어옴. mechanism 이 그대로
    // 자기 ctx.data 참조로 사용해 view 의 initialData 와 동일 객체를 가리키게 한다.
    // 원본 복원용 deepClone 은 별도 보관.
    const data = initialData as Record<string, unknown>;
    this.originalInitial = deepClone(data);
    if (this.shuffleOnReset) shuffleArrayFields(data);
    this.dataRef = data;
    this.ctx = this.createContext();
    this.projector.onInit?.(this.dataRef);
  }

  private createContext(): FacetContext {
    const self = this;
    const ctx: FacetContext = {
      data: this.dataRef,
      cancelled: false,
      async emit(event: FacetRuntimeEvent) {
        if (self.cancelled) return;
        // 1) paused/idle 이면 다음 신호 대기 (렌더링 전에 멈춤).
        //    silent 이벤트도 동일하게 멈춘다 — paused 는 "아무 것도 진행 안 함" 이므로.
        while (self.mode === 'paused' || self.mode === 'idle') {
          await new Promise<void>((res) => {
            self.stepResolve = res;
          });
          if (self.cancelled) return;
        }
        // 2) projector 갱신
        await self.projector?.onEvent(event);
        if (self.cancelled) return;
        // 3) silent 이벤트는 step boundary 가 아니다 — 후처리 없이 즉시 통과.
        if (event.silent) return;
        // 4) 후처리
        if (self.mode === 'stepping') {
          self.setMode('paused');
          return;
        }
        // playing — 속도 비례 지연
        await new Promise<void>((res) => {
          self.pendingTimerResolve = res;
          self.pendingTimer = setTimeout(() => {
            self.pendingTimer = null;
            self.pendingTimerResolve = null;
            res();
          }, Math.max(10, BASE_DELAY_MS / Math.max(0.01, self.speedMul)));
        });
      },
      metric(name: string, delta: MetricDelta) {
        const cur = (self.metricsState.get(name) ?? 0) + (delta === 'inc' ? 1 : delta);
        self.metricsState.set(name, cur);
        self.hooks.onMetric?.(name, cur);
      },
    };
    // cancelled 는 read-only — getter 로 동적 반영.
    Object.defineProperty(ctx, 'cancelled', {
      get: () => self.cancelled,
    });
    return ctx;
  }

  private setMode(next: Mode): void {
    this.mode = next;
    this.hooks.onRunningChange?.(next === 'playing' || next === 'stepping');
  }

  private clearPendingTimer(): void {
    if (this.pendingTimer !== null) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    if (this.pendingTimerResolve) {
      const r = this.pendingTimerResolve;
      this.pendingTimerResolve = null;
      r();
    }
  }

  private flushStepResolve(): void {
    if (this.stepResolve) {
      const r = this.stepResolve;
      this.stepResolve = null;
      r();
    }
  }

  private async runAlgorithm(): Promise<void> {
    if (!this.ctx) return;
    const myRun = ++this.runId;
    try {
      await this.coroutineFn(this.ctx);
    } catch (err) {
      if (!this.cancelled) {
        console.error('[facet] algorithm error:', err);
      }
    }
    if (myRun !== this.runId) return;
    this.hooks.onComplete?.(!this.cancelled);
    this.setMode('idle');
  }

  private ensureStarted(): void {
    if (this.activePromise) return;
    this.cancelled = false;
    this.activePromise = this.runAlgorithm().finally(() => {
      this.activePromise = null;
    });
  }

  start(): void {
    if (this.mode === 'playing') return;
    this.setMode('playing');
    this.ensureStarted();
    this.flushStepResolve();
  }

  stop(): void {
    if (this.mode === 'idle') return;
    this.setMode('paused');
    this.clearPendingTimer();
    // emit 의 paused 분기에서 다음 이벤트 시 멈춤
  }

  step(): void {
    if (!this.activePromise) {
      this.setMode('stepping');
      this.ensureStarted();
      return;
    }
    this.setMode('stepping');
    this.flushStepResolve();
  }

  async reset(): Promise<void> {
    this.cancelled = true;
    this.clearPendingTimer();
    this.flushStepResolve();
    if (this.activePromise) {
      try {
        await this.activePromise;
      } catch {
        // ignore
      }
    }
    this.cancelled = false;
    // 데이터 복원 — ctx.data 의 참조는 유지하고 키만 in-place 갱신.
    const fresh = deepClone(this.originalInitial) as Record<string, unknown>;
    if (this.shuffleOnReset) shuffleArrayFields(fresh);
    for (const k of Object.keys(this.dataRef)) {
      if (!(k in fresh)) delete this.dataRef[k];
    }
    Object.assign(this.dataRef, fresh);
    // metric 카운터 비우고 외부에도 표시 복원 신호 발행.
    this.metricsState.clear();
    this.hooks.onMetricsReset?.();
    this.hooks.onComplete?.(false);
    this.hooks.onRunningChange?.(false);
    this.projector?.onReset?.();
    // 데이터 복원 후 projector 도 초기 상태로 다시 세팅한다.
    this.projector?.onInit?.(this.dataRef);
    this.setMode('idle');
  }

  destroy(): void {
    this.cancelled = true;
    this.clearPendingTimer();
    this.flushStepResolve();
  }

  onControl(action: string, payload?: unknown): void {
    switch (action) {
      case 'play':  this.start(); break;
      case 'pause': this.stop(); break;
      case 'step':  this.step(); break;
      case 'reset': void this.reset(); break;
      case 'speed': this.setSpeed(typeof payload === 'number' ? payload : 1); break;
      default:
        // 미지원 action 은 호환성 검증에서 걸러져야 한다. 여기까지 왔으면 무시.
        break;
    }
  }

  dispatch(_event: MechanismDispatchEvent): void {
    // CoroutineMechanism 은 사용자 입력 채널을 사용하지 않는다.
    // 새 메커니즘 type 이 들어올 때 의미 있는 처리 추가.
  }

  getSpeed(): number {
    return this.speedMul;
  }

  setSpeed(mul: number): void {
    this.speedMul = mul;
  }
}

/**
 * 입력 반응형 메커니즘 — 사용자가 누르는 한 번의 컨트롤 입력 (push/pop/peek 등) 이
 * algorithm 의 다음 단계로 1:1 매핑된다. 동시에 algorithm 은 자율 시간 흐름
 * (`ctx.sleep(ms)`) 으로 자동 시연 시퀀스도 진행할 수 있다.
 *
 * 진행 모델:
 *   - mount 직후 algorithm 즉시 시작 (start/stop/step 은 no-op).
 *   - algorithm 은 `await ctx.waitForInput()` 으로 dispatch 신호 대기.
 *   - mechanism 은 `dispatch({type, payload})` 로 큐 또는 대기 중 algorithm 깨움.
 *   - control-bar 의 facet 고유 button 은 onControl(action) 으로 들어와
 *     mechanism 이 dispatch 채널로 라우팅 (지정된 builtin action 'reset'/'speed' 외).
 *   - reset 은 진행 중 algorithm 을 cancel + 재시작.
 *
 * supportedControls = ['reset', 'speed', '*'] — 와일드카드는
 * `assertControlsSupported` 가 별도로 통과시킨다 (facet 고유 어휘 자유).
 */
export class ReactiveMechanism implements Mechanism {
  readonly kind = 'reactive' as const;
  readonly supportedControls = ['reset', 'speed', '*'] as const;

  private projector: ProjectorInstance | null = null;
  private hooks: MechanismHooks = {};
  private originalInitial: unknown = undefined;
  private dataRef: Record<string, unknown> = {};
  private ctx: ReactiveContext | null = null;

  private speedMul = 1;
  private cancelled = false;
  private runId = 0;
  private activePromise: Promise<void> | null = null;
  private metricsState = new Map<string, number>();

  // 사용자 입력 채널.
  private inputQueue: ReactiveInputEvent[] = [];
  private inputResolver: ((event: ReactiveInputEvent) => void) | null = null;
  private inputRejector: ((reason: unknown) => void) | null = null;

  // 자율 시간 흐름 (sleep) 채널.
  private pendingSleepResolve: ((ok: boolean) => void) | null = null;
  private pendingSleepTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly algorithmFn: (ctx: ReactiveContext) => Promise<void>) {}

  init(projector: ProjectorInstance, initialData: unknown, opts?: MechanismInitOptions): void {
    this.projector = projector;
    this.hooks = opts?.hooks ?? {};
    const data = initialData as Record<string, unknown>;
    this.originalInitial = deepClone(data);
    this.dataRef = data;
    this.ctx = this.createContext();
    this.projector.onInit?.(this.dataRef);
    this.ensureStarted();
  }

  private createContext(): ReactiveContext {
    const self = this;
    const ctx = {
      data: self.dataRef,
      cancelled: false,
      async emit(event: FacetRuntimeEvent) {
        if (self.cancelled) return;
        await self.projector?.onEvent(event);
      },
      metric(name: string, delta: MetricDelta) {
        const cur = (self.metricsState.get(name) ?? 0) + (delta === 'inc' ? 1 : delta);
        self.metricsState.set(name, cur);
        self.hooks.onMetric?.(name, cur);
      },
      async waitForInput<T extends ReactiveInputEvent = ReactiveInputEvent>(): Promise<T> {
        if (self.cancelled) throw new Error('cancelled');
        const queued = self.inputQueue.shift();
        if (queued) return queued as T;
        return new Promise<T>((resolve, reject) => {
          self.inputResolver = (e) => resolve(e as T);
          self.inputRejector = reject;
        });
      },
      async sleep(ms: number): Promise<boolean> {
        if (self.cancelled) return false;
        const adjusted = Math.max(10, ms / Math.max(0.01, self.speedMul));
        return new Promise<boolean>((resolve) => {
          self.pendingSleepResolve = resolve;
          self.pendingSleepTimer = setTimeout(() => {
            self.pendingSleepTimer = null;
            self.pendingSleepResolve = null;
            resolve(true);
          }, adjusted);
        });
      },
    } as ReactiveContext;
    Object.defineProperty(ctx, 'cancelled', { get: () => self.cancelled });
    return ctx;
  }

  private clearPendingSleep(): void {
    if (this.pendingSleepTimer !== null) {
      clearTimeout(this.pendingSleepTimer);
      this.pendingSleepTimer = null;
    }
    if (this.pendingSleepResolve) {
      const r = this.pendingSleepResolve;
      this.pendingSleepResolve = null;
      r(false);
    }
  }

  private flushInputRejector(): void {
    if (this.inputRejector) {
      const r = this.inputRejector;
      this.inputRejector = null;
      this.inputResolver = null;
      r(new Error('cancelled'));
    }
  }

  private async runAlgorithm(): Promise<void> {
    if (!this.ctx) return;
    const myRun = ++this.runId;
    try {
      await this.algorithmFn(this.ctx);
    } catch (err) {
      if (!this.cancelled && (err as Error)?.message !== 'cancelled') {
        console.error('[facet] reactive algorithm error:', err);
      }
    }
    if (myRun !== this.runId) return;
    this.hooks.onComplete?.(!this.cancelled);
  }

  private ensureStarted(): void {
    if (this.activePromise) return;
    this.cancelled = false;
    this.hooks.onRunningChange?.(true);
    this.activePromise = this.runAlgorithm().finally(() => {
      this.activePromise = null;
      if (!this.cancelled) this.hooks.onRunningChange?.(false);
    });
  }

  /** reactive 에서는 mount 즉시 시작이므로 외부 start/stop/step 은 no-op. */
  start(): void { /* no-op */ }
  stop(): void { /* no-op */ }
  step(): void { /* no-op */ }

  async reset(): Promise<void> {
    this.cancelled = true;
    this.clearPendingSleep();
    this.flushInputRejector();
    if (this.activePromise) {
      try { await this.activePromise; } catch { /* ignore */ }
    }
    this.cancelled = false;
    this.inputQueue.length = 0;
    const fresh = deepClone(this.originalInitial) as Record<string, unknown>;
    for (const k of Object.keys(this.dataRef)) {
      if (!(k in fresh)) delete this.dataRef[k];
    }
    Object.assign(this.dataRef, fresh);
    this.metricsState.clear();
    this.hooks.onMetricsReset?.();
    this.hooks.onComplete?.(false);
    this.projector?.onReset?.();
    this.projector?.onInit?.(this.dataRef);
    this.ensureStarted();
  }

  destroy(): void {
    this.cancelled = true;
    this.clearPendingSleep();
    this.flushInputRejector();
  }

  onControl(action: string, payload?: unknown): void {
    if (action === 'reset') {
      void this.reset();
      return;
    }
    if (action === 'speed') {
      this.setSpeed(typeof payload === 'number' ? payload : 1);
      return;
    }
    // facet 고유 button — dispatch 채널로 라우팅.
    this.dispatch({ type: action, payload });
  }

  dispatch(event: MechanismDispatchEvent): void {
    if (this.cancelled) return;
    if (this.inputResolver) {
      const r = this.inputResolver;
      this.inputResolver = null;
      this.inputRejector = null;
      r(event);
      return;
    }
    this.inputQueue.push(event);
  }

  getSpeed(): number { return this.speedMul; }
  setSpeed(mul: number): void { this.speedMul = mul; }
}
