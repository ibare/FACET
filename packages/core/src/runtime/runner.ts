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
import type { Theme } from '../views/design-tokens.js';
import type { ProjectorViews } from './projector.js';
import { CoroutineMechanism, type Mechanism, type MechanismHooks } from './mechanism.js';
import { buildLayout, mountBlocks } from './layout-builder.js';
import { getAlgorithm, getAlgorithmComputeResult, getProjector, getIR, listTranspilers, stripPrefix } from './registry.js';

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

function assertControlsSupported(controls: ControlSpec[], mechanism: Mechanism): void {
  for (const c of controls) {
    if (!mechanism.supportedControls.includes(c.action)) {
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

  // 2. 메커니즘 인스턴스화 (현재는 코루틴 한 종류).
  //    init 은 projector / view mount 가 끝난 뒤에 호출.
  const mechanism: Mechanism = new CoroutineMechanism(algorithmFn);

  // 3. Layout / blocks 처리 + locale 해석
  const locale = options?.locale;
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
  const built = buildLayout({ layout: json.layout, blocks: enrichedBlocks });

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
  const views = mountBlocks({
    blocks: enrichedBlocks,
    blockMounts: built.blockMounts,
    mountParams: { initialData: initialDataClone, locale, theme, dispatch: dispatchToMechanism },
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

  // 9. Projector 인스턴스화 — getSpeed 는 mechanism 위임.
  const projector = projectorFactory(views, { getSpeed: () => mechanism.getSpeed() });

  // 10. control-bar wire-up + hooks 정의.
  const controlBar = findControlBar(views);

  const hooks: MechanismHooks = {
    onRunningChange(running) {
      if (controlBar) callMethod(controlBar, 'setRunning', running);
    },
    onComplete(complete) {
      if (controlBar) callMethod(controlBar, 'setComplete', complete);
    },
    onMetric(name, value) {
      if (controlBar) callMethod(controlBar, 'updateMetric', name, value);
    },
    onMetricsReset() {
      if (controlBar) callMethod(controlBar, 'resetMetrics');
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
    const initSpeed = (callMethod(controlBar, 'getSpeed') as number | undefined) ?? 1;
    mechanism.setSpeed(initSpeed);
  }

  // 13. RunHandle — 외부 setSpeed 는 mechanism + control-bar 슬라이더 양쪽 동기화.
  function setSpeed(mul: number) {
    mechanism.setSpeed(mul);
    if (controlBar) callMethod(controlBar, 'setSpeed', mul);
  }

  function destroy() {
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

  if (options?.autoStart) mechanism.start();

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
