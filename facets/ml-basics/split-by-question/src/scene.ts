/**
 * splitByQuestion 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 에는 `let` 이 한 자리도 없었다. **상태는 전부 stage 에 있었고, 그중
 * 절반은 변수가 아니라 화면 자신이었다.**
 *
 * - `let xMin` · `xMax` · `yMin` · `yMax` — **축의 척도.** `xPix` · `yPix` 가 이
 *   넷으로 자리를 셈하므로 **화면의 모든 좌표가 거기서 나왔다.** 걸음이 실어 온
 *   것이 아니라 `setup` 이 한 번 셈해 제 변수에 적어 둔 값이라, 척도를 정하는
 *   자리와 쓰는 자리가 갈라져 있었다. 지금은 바탕 자료(점 · 자름 자리)에서 그리는
 *   쪽이 매번 셈한다 — 장면에 담는 것은 값의 범위조차 아니고 **점과 자름 자리**다.
 * - `let points` · `classes` · `xCuts` · `yCuts` — 선언이 준 자료를 stage 가
 *   **참조로** 쥐고 있었다. 지금은 `initial` 이 값을 베껴 담는다 (S-scene).
 * - `let bladeState: Blade` — **DOM 의 거울.** 칼날이 지금 선 자리·각·길이를 따로
 *   적어 두고 다음 운동의 **출발값**으로 삼았다 (`const from = bladeState`).
 *   `getAttribute` 를 안 쓰니 화면 되읽기 grep 을 지나가지만 병은 같다 — 되짚어
 *   세운 직후에는 그 거울이 **옛 화면의 칼날**이라 엉뚱한 데서 돌기 시작한다.
 *   지금은 `tried` 가 말하고 출발 그림은 `step.from` 이라는 **축 이름**에서
 *   셈으로 되살아난다.
 * - `type Axis = 'x' | 'y'` — **선언만 있고 값이 어디에도 저장되지 않던 타입.**
 *   지금 칼날이 어느 축에 섰나는 `Math.abs(bladeState.angle) < 45` 로 **각도에서
 *   도로 읽었다.** 각도 하나에 "어디에 섰나" 와 "얼마나 돌았나" 두 뜻이 실려
 *   있었다. 지금은 `picked` 가 말한다.
 * - `let bladeOn` · `regionsOn` · `chipsHidden` — 칼날이 서 있나, 두 땅을 칠했나,
 *   저울을 내려놓았나. 셋 다 `picked` 와 `tried` 에서 파생된다.
 * - `let shownLow` · `shownHigh` — 저울에 걸린 수. 운동 도중의 보간값이 그대로
 *   화면의 정본이었다. 지금은 `tally` 가 낸 값 하나뿐이고 보간은 그리는 쪽에 산다.
 * - **눈금의 `stroke`** — 어느 자리를 짚어 봤나. `tickNodes` 는 손잡이만 쥐고
 *   있었고 "짚었다" 는 사실은 오직 선의 칠에 있었다. 게다가 `pure ? accent :
 *   risingMarker` 로 **한 속성에 짚음(표식)과 갈림(형편) 두 뜻**이 실려 있었다.
 * - **`ghostNodes` 의 길이** — 이 축에서 몇 자리를 해 봤나. `const` 배열인데
 *   `push` 로 알맹이가 자라므로 `let` grep 을 지나간다. 지금은 `tried` 다.
 * - **`blade` 의 `stroke`** — 갈렸나. `finish()` 가 칠하는 것이 유일한 보관처라
 *   되돌릴 명령이 없었다. 지금은 `done` 과 `isPure` 가 말한다.
 *
 * ── 수는 한 출처에서만 나온다
 *
 * 옛 발신은 `threshold` · `low` · `high` · `pure` · `tried` 를 전부 실어 왔다.
 * 그 전부가 **점과 자름 자리에서 곧바로 나오는 수**다.
 *
 * - **자름 자리** — `sweep` 이 `cuts` 를 차례대로 훑으므로 **이 축에서 몇 번째
 *   칼금인가**가 곧 그 자리다. `xCuts[triedOn('x').length]`.
 * - **양쪽의 셈** — `algorithm.ts` 가 내준 `tally` 한 함수를 지난다. 저울의 폭도
 *   비율 글자도 캡션의 순수 여부도 같은 한 함수에서 나오므로 갈릴 자리가 없다.
 * - **해 본 자리의 수** — `triedOn(axis).length`. 캡션의 `{n}` 과 화면의 유령
 *   칼금이 같은 배열에서 나온다.
 *
 * 남긴 것은 `axis-picked` 의 `axis` 하나뿐이다. **어느 축에 설 것인가는 걸음이
 * 내리는 판정**이고, 그것이 이 조각이 말하려는 바 자체다 (프로토콜 4 절의 셋째 줄).
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 점의 값과 자름 자리라는 **구조**만 담고 화면 자리는 캔버스에서
 * 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 문안도 담지 않는다 — `captionOf`
 * 가 무엇을 말할지와 그 인자만 내고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { oneLabelOnly, tally, type SideTally, type SplitPoint } from './algorithm.js';

/** 자름선이 설 수 있는 축. */
export type SplitAxis = 'x' | 'y';

/** 그어 본 칼금 하나. 축과 자리만 담고 셈은 전부 파생한다. */
export type TriedCut = {
  axis: SplitAxis;
  threshold: number;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * `axis` 만 계기값을 싣는다 — 갈아 세우는 운동은 **떠나온 축**의 칼날에서
 * 출발하는데, 그것을 `prev` 에서 꺼내 쓰면 "`prev` 는 고르는 데만" 을 어긴다
 * (S-scene). 좌표가 아니라 축의 이름을 실으므로 출발 칼날도 `bladeOn` 이라는 같은
 * 함수를 지난다.
 *
 * 나머지 셋은 아무것도 싣지 않는다. 칼금이 어디서 어디로 미끄러지나는 `tried` 가,
 * 되짚을 유령이 몇인가는 그 배열의 길이가 이미 말한다.
 */
export type SplitStep =
  /** 자름선이 설 축을 고른다. `from` 이 null 이면 처음 세우는 것이다. */
  | { kind: 'axis'; from: SplitAxis | null }
  /** 자름선이 다음 자리로 미끄러지고 저울이 따라 바뀐다. */
  | { kind: 'cut' }
  /** 이 축에서 짚은 자리를 순서대로 되짚는다. */
  | { kind: 'sweep' }
  /** 갈린 자리를 못 박는다. */
  | { kind: 'done' };

export type SplitByQuestionScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 점 전부. 값을 베껴 담는다 — 러너가 주는 객체를 참조로 쥐지 않는다 (S-scene). */
  points: readonly SplitPoint[];
  /** 이름표 두 종. 앞이 저울의 아래쪽 칸이다. */
  classes: readonly [string, string];
  /** 가로축에서 시도할 자름 자리, 차례대로. */
  xCuts: readonly number[];
  /** 세로축에서 시도할 자름 자리, 차례대로. */
  yCuts: readonly number[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 세워 본 축, 세운 차례대로. **마지막이 지금 선 축**이다. */
  picked: readonly SplitAxis[];
  /**
   * 그어 본 칼금 전부, 그은 차례대로. 축이 섞여 있다.
   *
   * **남는 자취**다 — 어느 자리를 얼마나 해 봤나가 이 조각의 논증 자체이므로
   * 정적 그리기가 유령 칼금으로 세운다 (S-scene). 옛 stage 는 그것을 `ghostNodes`
   * 라는 DOM 배열과 눈금의 칠에만 적어 두었다.
   */
  tried: readonly TriedCut[];
  /** 다 써 보고도 갈리지 않은 축. 완주 화면까지 남는 표식이다. */
  exhausted: readonly SplitAxis[];
  /** 논증이 끝났나. */
  done: boolean;

  step: SplitStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `picked` · `tried` · `exhausted` · `done` 은 전부 걸어온 자취라 여기 넣지
 * 않는다 — 넣으면 되감은 화면이 이미 그어 둔 칼금을 단 채로 선다 (S-scene).
 */
type Base = Pick<SplitByQuestionScene, 'points' | 'classes' | 'xCuts' | 'yCuts'>;

/**
 * 되돌린 뒤의 장면 — 점과 두 레일만 서 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 TypeScript 의 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로
 * 통과한다 (S-scene).
 */
function atStart(base: Base): SplitByQuestionScene {
  return {
    points: base.points,
    classes: base.classes,
    xCuts: base.xCuts,
    yCuts: base.yCuts,
    picked: [],
    tried: [],
    exhausted: [],
    done: false,
    step: null,
  };
}

// ── unknown → 장면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9) ──

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function readAxis(v: unknown): SplitAxis | null {
  return v === 'x' || v === 'y' ? v : null;
}

function readPoints(v: unknown): SplitPoint[] {
  if (!Array.isArray(v)) return [];
  const out: SplitPoint[] = [];
  for (const item of v) {
    const raw = item as { x?: unknown; y?: unknown; label?: unknown };
    const x = num(raw?.x);
    const y = num(raw?.y);
    if (x === null || y === null || typeof raw?.label !== 'string') continue;
    // 값을 베껴 담는다 — 러너가 주는 객체를 그대로 쥐지 않는다 (S-scene).
    out.push({ x, y, label: raw.label });
  }
  return out;
}

function readNumbers(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const item of v) {
    const n = num(item);
    if (n !== null) out.push(n);
  }
  return out;
}

function readClasses(v: unknown, points: readonly SplitPoint[]): [string, string] {
  if (Array.isArray(v) && typeof v[0] === 'string' && typeof v[1] === 'string') {
    return [v[0], v[1]];
  }
  // 선언이 이름표를 안 주면 점에서 처음 보인 순서로 둘을 잡는다.
  const seen: string[] = [];
  for (const p of points) if (!seen.includes(p.label)) seen.push(p.label);
  return [seen[0] ?? '', seen[1] ?? ''];
}

// ── 파생. 화면이 쓰는 것은 전부 여기를 지난다 ───────────────────────────────

/** 지금 자름선이 선 축. 아직 아무 축도 세우지 않았으면 null. */
export function currentAxis(scene: SplitByQuestionScene): SplitAxis | null {
  return scene.picked[scene.picked.length - 1] ?? null;
}

/** 그 축에서 시도하기로 선언된 자름 자리. */
export function cutsOn(scene: SplitByQuestionScene, axis: SplitAxis): readonly number[] {
  return axis === 'x' ? scene.xCuts : scene.yCuts;
}

/** 그 축에서 그어 본 칼금, 그은 차례대로. */
export function triedOn(scene: SplitByQuestionScene, axis: SplitAxis): TriedCut[] {
  return scene.tried.filter((cut) => cut.axis === axis);
}

/** 지금 칼날이 놓인 칼금. 축만 세우고 아직 긋지 않았으면 null. */
export function currentCut(scene: SplitByQuestionScene): TriedCut | null {
  const axis = currentAxis(scene);
  if (axis === null) return null;
  const last = scene.tried[scene.tried.length - 1];
  return last !== undefined && last.axis === axis ? last : null;
}

/** 지금 칼금 **직전에** 같은 축에서 그었던 칼금. 미끄러지는 운동의 출발이다. */
export function previousCut(scene: SplitByQuestionScene): TriedCut | null {
  const axis = currentAxis(scene);
  if (axis === null) return null;
  const same = triedOn(scene, axis);
  const cur = currentCut(scene);
  return (cur === null ? same[same.length - 1] : same[same.length - 2]) ?? null;
}

/** 그 축에서 마지막으로 그었던 칼금. 축을 떠날 때의 칼날 자리다. */
export function lastCutOn(scene: SplitByQuestionScene, axis: SplitAxis): TriedCut | null {
  const same = triedOn(scene, axis);
  return same[same.length - 1] ?? null;
}

/** 그어 보고 버린 칼금 — 지금 칼날이 놓인 것 말고 전부. 헛걸음의 자취다. */
export function ghostCuts(scene: SplitByQuestionScene): TriedCut[] {
  const cur = currentCut(scene);
  return cur === null ? [...scene.tried] : scene.tried.slice(0, -1);
}

/** 그 칼금이 양쪽에 무엇을 몇 개씩 담는가. 저울도 비율 글자도 이 한 함수를 지난다. */
export function tallyAt(
  scene: SplitByQuestionScene,
  cut: TriedCut,
): { low: SideTally; high: SideTally } {
  return tally(scene.points, scene.classes, cut.axis, cut.threshold);
}

/** 그 칼금이 양쪽을 한 이름표씩으로 갈랐는가. */
export function isPure(scene: SplitByQuestionScene, cut: TriedCut): boolean {
  const { low, high } = tallyAt(scene, cut);
  return oneLabelOnly(low) && oneLabelOnly(high);
}

/**
 * 캡션이 말할 것. 문자가 아니라 **무엇을 말할지와 인자**다 (C10).
 *
 * 장면에 캡션 필드를 두지 않는다 — `picked` · `tried` · `exhausted` · `done` 에서
 * 전부 파생되므로 따로 실으면 같은 것을 두 번 말하는 꼴이 된다.
 */
export type SplitCaption =
  | { kind: 'start' }
  | { kind: 'axis'; axis: SplitAxis }
  | { kind: 'cut'; threshold: number; pure: boolean }
  | { kind: 'exhausted'; tried: number }
  | { kind: 'done' };

export function captionOf(scene: SplitByQuestionScene): SplitCaption {
  if (scene.done) return { kind: 'done' };
  const axis = currentAxis(scene);
  if (axis === null) return { kind: 'start' };
  // 소진은 그 축의 마지막 칼금 위에서 말해지므로 칼금보다 먼저 본다.
  if (scene.exhausted.includes(axis)) {
    return { kind: 'exhausted', tried: triedOn(scene, axis).length };
  }
  const cut = currentCut(scene);
  if (cut !== null) return { kind: 'cut', threshold: cut.threshold, pure: isPure(scene, cut) };
  return { kind: 'axis', axis };
}

export const splitByQuestionScene: ScenePlan<SplitByQuestionScene> = {
  /**
   * 첫 장면은 바탕만 세우고 비어 있다 — 점 열과 두 레일만 서 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 점 배열은
   * 러너가 mechanism 과 view 에 함께 주는 **한 객체**라 `readPoints` 가 값을 베껴
   * 새 배열을 낸다 (S-scene).
   */
  initial(initialData: unknown): SplitByQuestionScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const points = readPoints(d.points);
    return atStart({
      points,
      classes: readClasses(d.classes, points),
      xCuts: readNumbers(d.xCuts),
      yCuts: readNumbers(d.yCuts),
    });
  },

  reduce(scene: SplitByQuestionScene, event: FacetRuntimeEvent): SplitByQuestionScene {
    switch (event.type) {
      /*
       * 자름선이 설 축을 고른다. 떠나온 축을 걸음에 실어 출발 칼날을 셈으로
       * 되살린다 — 좌표가 아니라 축의 이름이다 (S-scene).
       */
      case 'axis-picked': {
        const p = event.payload as { axis?: unknown } | undefined;
        const axis = readAxis(p?.axis);
        if (axis === null) return scene;
        return {
          ...scene,
          picked: [...scene.picked, axis],
          step: { kind: 'axis', from: currentAxis(scene) },
        };
      }

      /*
       * 다음 자리로 칼금을 옮긴다.
       *
       * 자리를 받지 않는다 — **이 축에서 몇 번째 칼금인가**가 곧 그 자리이고,
       * 그 목록은 선언이 이미 주었다. 세울 축이 없는 채로 오면 그을 데가 없으므로
       * 조용히 흘린다 (C2).
       */
      case 'cut-tried': {
        const axis = currentAxis(scene);
        if (axis === null) return scene;
        const threshold = cutsOn(scene, axis)[triedOn(scene, axis).length];
        if (threshold === undefined) return scene;
        return { ...scene, tried: [...scene.tried, { axis, threshold }], step: { kind: 'cut' } };
      }

      // 이 축은 다 써 봤다. 완주 화면까지 남는 표식이라 자취에 적는다.
      case 'axis-exhausted': {
        const axis = currentAxis(scene);
        if (axis === null || scene.exhausted.includes(axis)) return scene;
        return { ...scene, exhausted: [...scene.exhausted, axis], step: { kind: 'sweep' } };
      }

      case 'done':
        return { ...scene, done: true, step: { kind: 'done' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({
          points: scene.points,
          classes: scene.classes,
          xCuts: scene.xCuts,
          yCuts: scene.yCuts,
        });

      default:
        // 이 algorithm 이 발신하는 것은 위 다섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
