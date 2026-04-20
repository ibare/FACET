/**
 * runFacet — 4-layer 아키텍처의 진입점 (4번 layer).
 *
 * JSON 을 해석해 layout/blocks 구성, 알고리즘 코루틴 실행,
 * 이벤트를 Projector 로 라우팅, 컨트롤(재생/단계/정지/리셋/속도) 처리.
 */

import type { FacetJson } from '../types/facet-json.js';
import type { LocaleStr } from '../types/locale.js';
import { resolveLocale } from '../types/locale.js';
import type { Theme } from '../views/design-tokens.js';
import type { FacetContext, MetricDelta } from './context.js';
import type { FacetRuntimeEvent } from '../types/event.js';
import type { ProjectorViews } from './projector.js';
import { buildLayout, mountBlocks } from './layout-builder.js';
import { getAlgorithm, getProjector, getIR, listTranspilers, stripPrefix } from './registry.js';

const BASE_DELAY_MS = 400;

type Mode = 'idle' | 'playing' | 'paused' | 'stepping';

export type FacetRunHandle = {
  start(): void;
  stop(): void;
  step(): void;
  reset(): void;
  setSpeed(multiplier: number): void;
  destroy(): void;
};

export type RunFacetOptions = {
  autoStart?: boolean;
  /** facet 의 LocaleStr 텍스트와 View 내부 라벨을 해석할 언어. 기본 'en'. */
  locale?: string;
  /** View 가 사용할 색상 팔레트. 기본 'light'. 변경 시 호출자가 재마운트해야 함. */
  theme?: Theme;
};

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function hasMethod(obj: unknown, name: string): obj is Record<string, (...args: unknown[]) => unknown> {
  return !!obj && typeof (obj as Record<string, unknown>)[name] === 'function';
}

function callMethod(obj: unknown, name: string, ...args: unknown[]): unknown {
  if (hasMethod(obj, name)) return (obj as Record<string, (...a: unknown[]) => unknown>)[name](...args);
  return undefined;
}

function findControlBar(views: ProjectorViews): ProjectorViews[string] | null {
  for (const v of Object.values(views)) {
    if (hasMethod(v, 'onPlay') && hasMethod(v, 'onPause')) return v;
  }
  return null;
}

export function runFacet(
  json: FacetJson,
  mountEl: HTMLElement,
  options?: RunFacetOptions,
): FacetRunHandle {
  // 1. 모듈 조회
  const algorithmName = stripPrefix(json.algorithm, 'module');
  const projectorName = stripPrefix(json.projector, 'module');
  const algorithmFnRaw = getAlgorithm(algorithmName);
  const projectorFactory = getProjector(projectorName);
  if (!algorithmFnRaw) throw new Error(`알고리즘 모듈 미등록: ${algorithmName}`);
  if (!projectorFactory) throw new Error(`Projector 모듈 미등록: ${projectorName}`);
  const algorithmFn = algorithmFnRaw;

  // 2. Layout / blocks 마운트
  const locale = options?.locale;
  const theme: Theme = options?.theme ?? 'light';
  const blocks = json.blocks;

  // 사용자 노출 텍스트(LocaleStr) 를 현재 locale 로 해석.
  // - title-block 자동 채움 (blocks 미지정 시 facet.title/description 주입)
  // - control-bar metrics[].label
  // - code-view label
  const enrichedBlocks: typeof blocks = { ...blocks };
  for (const [k, v] of Object.entries(enrichedBlocks)) {
    if (v.type === 'title-block') {
      const tb = v as { title?: LocaleStr; description?: LocaleStr };
      enrichedBlocks[k] = {
        ...v,
        title: resolveLocale(tb.title ?? json.title, locale),
        description: resolveLocale(tb.description ?? json.description, locale),
      };
    } else if (v.type === 'control-bar') {
      const cb = v as { metrics?: { name: string; label: LocaleStr; initial?: number }[] };
      if (cb.metrics) {
        enrichedBlocks[k] = {
          ...v,
          metrics: cb.metrics.map((m) => ({
            ...m,
            label: resolveLocale(m.label, locale),
          })),
        };
      }
    } else if (v.type === 'code-view') {
      const cv = v as { label?: LocaleStr };
      if (cv.label !== undefined) {
        enrichedBlocks[k] = { ...v, label: resolveLocale(cv.label, locale) };
      }
    }
  }

  const initialDataClone = deepClone(json.initialData) as Record<string, unknown>;
  const built = buildLayout({ layout: json.layout, blocks: enrichedBlocks });

  mountEl.textContent = '';
  mountEl.appendChild(built.root);

  // 3. code-view: IR 검증 후 IR 객체와 호환 transpiler 목록을 view 에 주입.
  //    실제 transpile 은 사용자가 언어를 추가하는 시점에 view 가 호출.
  for (const [ref, spec] of Object.entries(enrichedBlocks)) {
    if (spec.type !== 'code-view') continue;
    const cv = spec as { ir?: string };
    if (cv.ir === undefined) continue; // IR 미지정 → 빈 패널 (의도적 허용)
    const irName = stripPrefix(cv.ir, 'ir');
    const ir = getIR(irName);
    if (!ir) throw new Error(`code-view "${ref}": IR 미등록 — "${irName}"`);
    const compatible = listTranspilers().filter((t) => t.supports.includes(ir.paradigm));
    enrichedBlocks[ref] = { ...spec, _ir: ir, _transpilers: compatible };
  }

  const views = mountBlocks({
    blocks: enrichedBlocks,
    blockMounts: built.blockMounts,
    mountParams: { initialData: initialDataClone, locale, theme },
  });

  // 4. Projector 인스턴스화 + 초기화
  const projector = projectorFactory(views);
  projector.onInit?.(initialDataClone);

  // 5. 컨트롤 wire-up
  const controlBar = findControlBar(views);

  // 6. 실행 상태
  let mode: Mode = 'idle';
  let speedMul = 1;
  let cancelled = false;
  let runId = 0;
  let activePromise: Promise<void> | null = null;
  let stepResolve: (() => void) | null = null;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingTimerResolve: (() => void) | null = null;

  if (controlBar) {
    callMethod(controlBar, 'onSpeedChange', (mul: number) => {
      speedMul = mul;
    });
    speedMul = (callMethod(controlBar, 'getSpeed') as number | undefined) ?? 1;
  }

  function clearPendingTimer() {
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    if (pendingTimerResolve) {
      const r = pendingTimerResolve;
      pendingTimerResolve = null;
      r();
    }
  }

  function flushStepResolve() {
    if (stepResolve) {
      const r = stepResolve;
      stepResolve = null;
      r();
    }
  }

  function setMode(next: Mode) {
    mode = next;
    if (controlBar) {
      callMethod(controlBar, 'setRunning', next === 'playing' || next === 'stepping');
    }
  }

  // FacetContext 생성
  const context: FacetContext = {
    data: initialDataClone,
    cancelled: false,
    async emit(event: FacetRuntimeEvent) {
      if (cancelled) return;
      // 1) paused/idle 이면 다음 신호 대기 (렌더링 전에 멈춤)
      while (mode === 'paused' || mode === 'idle') {
        await new Promise<void>((res) => {
          stepResolve = res;
        });
        if (cancelled) return;
      }
      // 2) projector 갱신
      await projector.onEvent(event);
      if (cancelled) return;
      // 3) 후처리
      if (mode === 'stepping') {
        setMode('paused');
        return;
      }
      // playing — 속도 비례 지연
      await new Promise<void>((res) => {
        pendingTimerResolve = res;
        pendingTimer = setTimeout(() => {
          pendingTimer = null;
          pendingTimerResolve = null;
          res();
        }, Math.max(10, BASE_DELAY_MS / Math.max(0.01, speedMul)));
      });
    },
    metric(name: string, delta: MetricDelta) {
      if (!controlBar) return;
      const cb = controlBar as Record<string, unknown>;
      const cur = (metricsState.get(name) ?? 0) + (delta === 'inc' ? 1 : delta);
      metricsState.set(name, cur);
      if (typeof cb.updateMetric === 'function') {
        (cb.updateMetric as (n: string, v: number) => void)(name, cur);
      }
    },
  };

  const metricsState = new Map<string, number>();

  // cancelled 는 read-only (인터페이스). getter 로 동적 반영.
  Object.defineProperty(context, 'cancelled', {
    get: () => cancelled,
  });

  // 7. 실행 lifecycle
  async function runAlgorithm() {
    const myRun = ++runId;
    try {
      await algorithmFn(context);
    } catch (err) {
      if (!cancelled) {
        console.error('[facet] algorithm error:', err);
      }
    }
    if (myRun !== runId) return;
    if (controlBar) callMethod(controlBar, 'setComplete', !cancelled);
    setMode('idle');
  }

  function ensureStarted() {
    if (activePromise) return;
    cancelled = false;
    activePromise = runAlgorithm().finally(() => {
      activePromise = null;
    });
  }

  function start() {
    if (mode === 'playing') return;
    setMode('playing');
    ensureStarted();
    flushStepResolve();
  }

  function stop() {
    if (mode === 'idle') return;
    setMode('paused');
    clearPendingTimer();
    // emit 의 paused 분기에서 다음 이벤트 시 멈춤
  }

  function step() {
    if (!activePromise) {
      setMode('stepping');
      ensureStarted();
      return;
    }
    setMode('stepping');
    flushStepResolve();
  }

  async function reset() {
    cancelled = true;
    clearPendingTimer();
    flushStepResolve();
    if (activePromise) {
      try {
        await activePromise;
      } catch {
        // ignore
      }
    }
    cancelled = false;
    // 데이터 복원
    Object.assign(context.data as Record<string, unknown>, deepClone(json.initialData) as Record<string, unknown>);
    // initialData 가 배열이면 Object.assign 로 복원 안되므로 키 갱신
    const fresh = deepClone(json.initialData) as Record<string, unknown>;
    for (const k of Object.keys(context.data as Record<string, unknown>)) {
      if (!(k in fresh)) delete (context.data as Record<string, unknown>)[k];
    }
    Object.assign(context.data as Record<string, unknown>, fresh);
    // metric 초기화
    metricsState.clear();
    if (controlBar) {
      callMethod(controlBar, 'resetMetrics');
      callMethod(controlBar, 'setComplete', false);
      callMethod(controlBar, 'setRunning', false);
    }
    projector.onReset?.();
    setMode('idle');
  }

  function setSpeed(mul: number) {
    speedMul = mul;
    if (controlBar) callMethod(controlBar, 'setSpeed', mul);
  }

  function destroy() {
    cancelled = true;
    clearPendingTimer();
    flushStepResolve();
    projector.onDestroy?.();
    for (const v of Object.values(views)) {
      if (hasMethod(v, 'destroy')) {
        try {
          (v as { destroy: () => void }).destroy();
        } catch {
          // ignore
        }
      }
    }
    if (built.root.parentElement) built.root.remove();
  }

  if (controlBar) {
    callMethod(controlBar, 'onPlay', start);
    callMethod(controlBar, 'onStep', step);
    callMethod(controlBar, 'onPause', stop);
    callMethod(controlBar, 'onReset', () => {
      void reset();
    });
  }

  if (options?.autoStart) start();

  return {
    start,
    stop,
    step,
    reset: () => {
      void reset();
    },
    setSpeed,
    destroy,
  };
}
