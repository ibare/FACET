/**
 * runFacet — 4-layer 아키텍처의 진입점 (4번 layer).
 *
 * JSON 을 해석해 layout/blocks 구성, projector 인스턴스화, 메커니즘 래핑,
 * 컨트롤바 ↔ 메커니즘 wire-up, View 입력 → mechanism.dispatch 라우팅을 담당.
 *
 * 알고리즘 진행 동력 (mode/cancelled/runId/timer/ctx) 은 모두 메커니즘 안에
 * 캡슐화되어 있다. 러너는 메커니즘을 외부 인터페이스(controlBar, View) 와
 * 연결하는 어댑터일 뿐이다.
 */

import type { FacetJson, BlockSpec, ControlSpec } from '../types/facet-json.js';
import type { LocaleStr } from '../types/locale.js';
import { resolveLocale } from '../types/locale.js';
import { makeTranslator } from './i18n.js';
import type { Theme } from '../views/design-tokens.js';
import type { ProjectorViews } from './projector.js';
import { CoroutineMechanism, ReactiveMechanism, type Mechanism, type MechanismHooks } from './mechanism.js';
import type { ReactiveContext } from './context.js';
import { Timeline } from './timeline.js';
import { buildLayout, defaultLayout, mountBlocks } from './layout-builder.js';
import {
  getAlgorithm,
  getAlgorithmComputeResult,
  getAlgorithmMechanismKind,
  getProjector,
  getIR,
  listTranspilers,
  stripPrefix,
} from './registry.js';

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

/**
 * blocks 에서 control-bar 블록을 찾아 그 controls 배열을 반환. 없으면 null.
 * supportedControls 호환성 검증의 입력이 된다.
 */
function findControlBarSpec(blocks: Record<string, BlockSpec>): ControlSpec[] | null {
  for (const v of Object.values(blocks)) {
    if (v.type === 'control-bar') {
      const cb = v as { controls?: ControlSpec[] };
      return cb.controls ?? [];
    }
  }
  return null;
}

/**
 * 러너가 스스로 처리하는 컨트롤 어휘 — mechanism 에 닿지 않는다.
 *
 * `seek` 은 알고리즘을 다시 돌리는 일이 아니라 러너가 쥔 자취를 projector 에
 * 다시 먹이는 일이라, 어느 mechanism 의 `supportedControls` 에도 없다. 걸러 두지
 * 않으면 `'*'` 와일드카드가 없는 coroutine facet 에서 미지원으로 throw 한다.
 */
const RUNNER_CONTROLS = new Set(['seek']);

function assertControlsSupported(controls: ControlSpec[], mechanism: Mechanism): void {
  // 메커니즘이 '*' 와일드카드를 supportedControls 에 두면 facet 고유 어휘를 자유 허용.
  const supported = new Set<string>(mechanism.supportedControls);
  const allowAny = supported.has('*');
  for (const c of controls) {
    if (RUNNER_CONTROLS.has(c.action)) continue;
    if (allowAny) continue;
    if (!supported.has(c.action)) {
      throw new Error(
        `컨트롤 미지원: action="${c.action}" 은 메커니즘 "${mechanism.kind}" 의 supportedControls 에 없음`,
      );
    }
  }
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

  // 2. 메커니즘 인스턴스화 — algorithm 등록 시 지정된 mechanismKind 로 분기.
  //    init 은 projector / view mount 가 끝난 뒤에 호출.
  const kind = getAlgorithmMechanismKind(algorithmName) ?? 'coroutine';
  const mechanism: Mechanism =
    kind === 'reactive'
      ? new ReactiveMechanism(algorithmFn as unknown as (ctx: ReactiveContext) => Promise<void>)
      : new CoroutineMechanism(algorithmFn);

  // 3. Layout / blocks 처리 + locale 해석
  const locale = options?.locale;
  // 저작자 문안(FacetJson.messages) 을 얹은 조회기. View 와 Projector 가 같은 것을
  // 쓰므로 한 facet 안에서 문안 출처가 갈리지 않는다.
  const tr = makeTranslator(locale, json.messages);
  const theme: Theme = options?.theme ?? 'light';
  const blocks = json.blocks;

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

  // 4. 컨트롤 호환성 검증 (mount 전에 빨리 실패).
  const controlBarSpec = findControlBarSpec(enrichedBlocks);
  if (controlBarSpec) assertControlsSupported(controlBarSpec, mechanism);

  // 5. 초기 데이터 준비 — view 와 mechanism 이 동일 객체를 공유.
  const initialDataClone = deepClone(json.initialData) as Record<string, unknown>;
  const built = buildLayout({
    layout: json.layout ?? defaultLayout(enrichedBlocks),
    blocks: enrichedBlocks,
  });

  mountEl.textContent = '';
  mountEl.appendChild(built.root);

  // 6. code-view: IR 검증 후 IR 객체와 호환 transpiler 목록을 view 에 주입.
  for (const [ref, spec] of Object.entries(enrichedBlocks)) {
    if (spec.type !== 'code-view') continue;
    const cv = spec as { ir?: string };
    if (cv.ir === undefined) continue;
    const irName = stripPrefix(cv.ir, 'ir');
    const ir = getIR(irName);
    if (!ir) throw new Error(`code-view "${ref}": IR 미등록 — "${irName}"`);
    const compatible = listTranspilers().filter((t) => t.supports.includes(ir.paradigm));
    enrichedBlocks[ref] = { ...spec, _ir: ir, _transpilers: compatible };
  }

  // 7. View mount — dispatch 콜백 주입으로 View 입력 → mechanism.dispatch 경로 확보.
  const dispatchToMechanism = (event: { type: string; payload?: unknown }) => mechanism.dispatch(event);
  /**
   * 되짚는 중인가. Timeline 이 켜고 끄고, stage 가 `params.isInstant()` 로 읽는다.
   *
   * 클로저라 mount 시점 이후의 값도 그대로 보인다.
   */
  let instantMode = false;
  /** 되짚기 직전에 걸어 둔 것을 거두라고 view 들이 맡긴 함수. */
  const scrubCleaners: Array<() => void> = [];
  const views = mountBlocks({
    blocks: enrichedBlocks,
    blockMounts: built.blockMounts,
    mountParams: {
      initialData: initialDataClone,
      locale,
      theme,
      t: tr,
      dispatch: dispatchToMechanism,
      isInstant: () => instantMode,
      onScrubStart: (fn: () => void) => scrubCleaners.push(fn),
    },
  });

  // 8. goal-preview(computeFrom: 'sorted') 블록에 알고리즘의 computeResult 결과 주입
  const computeResult = getAlgorithmComputeResult(algorithmName);
  if (computeResult) {
    let computed: unknown | undefined;
    for (const [ref, spec] of Object.entries(enrichedBlocks)) {
      if (spec.type !== 'goal-preview') continue;
      const gp = spec as { computeFrom?: string };
      if (gp.computeFrom !== 'sorted') continue;
      if (computed === undefined) {
        try {
          computed = computeResult(deepClone(json.initialData));
        } catch (err) {
          console.error('[facet] computeResult error:', err);
          break;
        }
      }
      const inst = views[ref] as { setData?: (v: number[]) => void } | undefined;
      const data = computed as { values?: number[] } | undefined;
      if (inst && typeof inst.setData === 'function' && Array.isArray(data?.values)) {
        inst.setData(data.values);
      }
    }
  }

  // 9. Projector 인스턴스화 — getSpeed 는 mechanism 위임, t 는 현재 locale 로 해석.
  const rawProjector = projectorFactory(views, {
    getSpeed: () => mechanism.getSpeed(),
    t: tr,
  });

  // 10. control-bar wire-up + hooks 정의.
  const controlBar = findControlBar(views);

  /**
   * 걸어간 자취. 스크럽 띠를 단 facet 만 쓴다.
   *
   * 자취는 언제나 적는다 — 띠가 없으면 흘려보낼 곳이 없을 뿐이다. 띠가 있는지로
   * 기록 여부를 가르면, 같은 facet 이 컨트롤 선언에 따라 다른 경로를 타게 된다.
   */
  const timeline = new Timeline({
    onLength(steps) {
      if (controlBar) callMethod(controlBar, 'setTimelineLength', steps);
    },
    onCursor(step) {
      if (controlBar) callMethod(controlBar, 'setTimelineCursor', step);
    },
    onInstant(on) {
      instantMode = on;
      // 켜질 때 걸어 둔 것을 거둔다. 두면 되짚기가 끝난 뒤 깨어나 옛 목표를 그린다.
      if (!on) return;
      for (const clean of scrubCleaners) {
        try {
          clean();
        } catch {
          // 한 view 가 실패해도 나머지는 거둔다.
        }
      }
    },
  });
  const projector = timeline.wrap(rawProjector);

  const hooks: MechanismHooks = {
    onRunningChange(running) {
      if (controlBar) callMethod(controlBar, 'setRunning', running);
    },
    onComplete(complete) {
      if (controlBar) callMethod(controlBar, 'setComplete', complete);
      // 알고리즘이 입력을 기다리기 시작하면 자동 재생이 완주한 것이다
      // (`ReactiveMechanism.enterAwaiting`). 그 순간 자취가 닫히고 띠를 끌 수 있다.
      if (complete) timeline.seal();
      if (controlBar) callMethod(controlBar, 'setTimelineSeekable', timeline.complete);
    },
    onMetric(name, value) {
      if (controlBar) callMethod(controlBar, 'updateMetric', name, value);
    },
    onMetricsReset() {
      // 되돌리기는 처음부터 다시 걷는 일이다 — 지난 자취를 버려야 같은 걸음이
      // 두 번 쌓이지 않는다. `onComplete(false)` 는 손짚기로 깨어날 때도 오므로
      // 되돌리기만 오는 이 훅에서 버린다.
      timeline.clear();
      if (controlBar) callMethod(controlBar, 'setTimelineSeekable', false);
      if (controlBar) {
        callMethod(controlBar, 'resetMetrics');
        // 위젯도 처음 자리로. 슬라이더가 가리키는 값과 화면이 어긋나지 않게 한다.
        callMethod(controlBar, 'resetInputs');
      }
    },
  };

  // 11. 메커니즘 초기화 — projector.onInit 도 mechanism 안에서 호출됨.
  mechanism.init(projector, initialDataClone, { shuffleOnReset: json.shuffleOnReset, hooks });

  // 12. control-bar 핸들러 등록.
  if (controlBar) {
    callMethod(controlBar, 'onPlay', () => mechanism.onControl('play'));
    callMethod(controlBar, 'onStep', () => mechanism.onControl('step'));
    callMethod(controlBar, 'onPause', () => mechanism.onControl('pause'));
    callMethod(controlBar, 'onReset', () => mechanism.onControl('reset'));
    callMethod(controlBar, 'onSpeedChange', (mul: number) => mechanism.onControl('speed', mul));
    // facet 고유 button (push/pop/peek 등) 통과 채널.
    callMethod(controlBar, 'onAction', (action: string, payload?: unknown) =>
      mechanism.onControl(action, payload),
    );
    // 스크럽 띠는 mechanism 을 타지 않는다 — 되짚기는 알고리즘을 다시 돌리는 일이
    // 아니라 적어 둔 자취를 projector 에 다시 먹이는 일이다. `onSpeedChange` 처럼
    // 전용 통로를 둬 control-bar 액션 어휘와 섞이지 않게 한다 (S-runtime).
    callMethod(controlBar, 'onSeek', (step: number) => timeline.seek(step));
    const initSpeed = (callMethod(controlBar, 'getSpeed') as number | undefined) ?? 1;
    mechanism.setSpeed(initSpeed);
  }

  // 13. RunHandle — 외부 setSpeed 는 mechanism + control-bar 슬라이더 양쪽 동기화.
  function setSpeed(mul: number) {
    mechanism.setSpeed(mul);
    if (controlBar) callMethod(controlBar, 'setSpeed', mul);
  }

  function destroy() {
    timeline.destroy();
    mechanism.destroy();
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

  // 호출자 지정이 있으면 그쪽이, 없으면 facet 선언이 정한다.
  if (options?.autoStart ?? json.autoStart) mechanism.start();

  return {
    start: () => mechanism.start(),
    stop: () => mechanism.stop(),
    step: () => mechanism.step(),
    reset: () => {
      void mechanism.reset();
    },
    setSpeed,
    destroy,
  };
}
