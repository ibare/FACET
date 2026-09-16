/**
 * pivotChoiceMatters 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * 옛 projector 에는 `let` 이 하나도 없었다. **상태는 전부 stage 안에 있었고, 그중
 * 어느 것도 `let` 이 아니었다** — `const lanes: Lane[]` 한 줄에 DOM 손잡이와 뜻이
 * 함께 묶여 있었다 (프로토콜 3-1 의 ⑤).
 *
 * - **`Lane.placed: Map<number, ArmSide>`** — 어느 칸이 어느 팔에 실렸나. 이 조각이
 *   보여 주려는 것의 절반인데 `const` 로 묶인 객체 안의 `Map` 이라 `let` grep 을
 *   통과한다. 되감기가 `placed.clear()` 로 털던 바로 그 자리다.
 * - **`Lane.angle`** — 저울대가 얼마나 기울었나. 다음 기움의 **출발값으로 되읽혔고**
 *   (`tiltTo` 의 `const from = lane.angle`), 되짚어 세운 직후에는 옛 화면의 각이었다.
 * - **`Lane.measure.textContent`** — `7 → 3` 이라는 수가 **문자열에만** 있었다.
 *   판을 견주는 데 쓰라고 띄운 수인데 화면 밖에서는 읽을 길이 없었다.
 * - **`Lane.brackets` 의 자식 유무** — 남는 일을 짚은 대괄호. `textContent = ''` 로
 *   비우고 다시 채우는 식이라 "이 판이 재어졌나" 가 DOM 에만 적혀 있었다.
 * - **`Lane.g` 의 `opacity`** — 지금 말하고 있는 판이 어느 것인가. `activate(i)` 가
 *   나머지를 흐리게 하고 `compareLanes()` 가 도로 밝혔다.
 * - **칸 `g` 의 부모** — `lane.g` 아래면 아직 줄에 있는 것이고 `lane.beam` 아래면
 *   저울대에 실린 것이다. **좌표가 아니라 단계를 말하는 자리**였다.
 * - **`type CellState = 'row' | 'pivot' | 'landed' | 'remaining'`** — 선언만 있고
 *   어디에도 저장되지 않는다. 칠을 고르는 데만 쓰였고 그래서 되감으면 사라졌다.
 *
 * 여기서는 그 일곱이 `trials` 하나다. 판마다 **건너간 칸 목록 · 기울었나 · 재었나**
 * 셋이면 나머지는 전부 셈으로 나온다.
 *
 * ── 수는 한 출처에서만 나온다 — 걸음이 실어 오는 것이 없다
 *
 * 이 조각은 **판마다의 수를 나란히 띄워 견주게 한다.** `7 → 3` 과 `7 → 6`, 양팔에
 * 실린 칸의 길이, 저울대의 기움, 캡션의 수가 한 화면에 함께 선다. 그것들이 갈리면
 * 그림이 제 안에서 거짓이 되므로 **여섯 발신 모두 payload 가 비어 있다.**
 *
 * - **바탕 + 순수 함수로 나오는 것은 `algorithm.ts` 의 `splitBy` 를 부른다.** 기준
 *   자리가 정해지면 어느 칸이 어느 팔의 몇 번째로 갈지가 통째로 결정된다. 장면이
 *   `algorithm.ts` 를 import 하는 방향은 원칙 1 이 허용한다 — 장면이 projector
 *   자리를 잇는다.
 * - **구조에서 세지는 것은 여기서 센다.** 양팔의 개수(`countOn`) · 남는 일
 *   (`remainingOf`) · 총수(`totalOf`) · 대괄호가 설 팔(`bracketedSides`) 이 그것이다.
 * - **몇 번째 판인가 · 몇 번째 칸인가는 발신이 온 차례가 말한다.** `pivot-lift` 가
 *   올 때마다 판이 하나 쌓이므로 `trials.length` 가 곧 그 판의 번호이고, 그 번호의
 *   기준 자리는 바탕의 `pivots` 가 쥐고 있다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 줄에서의 자리와 팔에서의 차례라는 **구조**만 담고, 칸 폭도
 * 저울대의 길이도 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece).
 * 문안도 담지 않는다 — 무엇을 말할지만 담고 수와 문자는 그리는 쪽이 `params.t` 로
 * 만든다 (C10). 그래서 캡션에는 인자가 하나도 없다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { splitBy, type PivotArmSide, type PivotPlacement } from './algorithm.js';

export type { PivotArmSide, PivotPlacement };

/**
 * 판 하나의 지금.
 *
 * 기준 자리는 여기 없다 — 판의 번호가 바탕의 `pivots` 에서 그것을 꺼낸다. 양팔의
 * 개수도 없다. 건너간 칸을 세면 나오는 것을 따로 적으면 그것이 두 번째 출처가 된다.
 */
export type PivotChoiceMattersTrial = {
  /** 지금까지 팔로 건너간 칸들. 원래 줄 순서 그대로 쌓인다. */
  placed: readonly PivotPlacement[];
  /** 저울대가 개수 차이만큼 기울어 멎었나. */
  settled: boolean;
  /** 남는 일에 대괄호가 섰나. **남는 강조**라 정적 그리기에도 들어간다. */
  measured: boolean;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 싣지 않는다 — 기준 칸이 떠나는 자리도, 건너가는 칸의 출발 자리도, 저울대가
 * 기울기 시작하는 각도(늘 0 이다. 기우는 걸음이 판마다 한 번뿐이라)도 전부 장면에서
 * 셈해진다. 그러니 `prev` 를 들출 까닭이 없다 (S-scene).
 *
 * 어느 판의 걸음인가도 싣지 않는다. 걸음은 언제나 **마지막으로 시작된 판**의 것이다.
 */
export type PivotChoiceMattersStep =
  /** 기준 칸이 줄에서 빠져 받침으로 내려간다. */
  | { kind: 'lift' }
  /** 칸 하나가 팔로 건너간다 — 방금 쌓인 마지막 `placed` 가 그것이다. */
  | { kind: 'move' }
  /** 저울대가 기운다. */
  | { kind: 'settle' }
  /** 남는 일에 대괄호가 서고 그 팔의 칸들이 한 번 부푼다. */
  | { kind: 'measure' }
  /** 흐렸던 판이 도로 밝아져 둘이 나란히 선다. */
  | { kind: 'compare' };

/**
 * 캡션이 말할 것. 인자가 없다 — 수는 전부 장면에서 셈해진다.
 *
 * 수를 여기 실으면 화면의 칸·대괄호와 갈릴 자리가 생긴다 (프로토콜 4 절 "화면에
 * 나란히 뜨는 수는 한 함수를 지나야 한다").
 */
export type PivotChoiceMattersCaption =
  | { kind: 'pickFirst' }
  | { kind: 'pickMiddle' }
  | { kind: 'splitEven' }
  | { kind: 'pileOneSide' }
  | { kind: 'workHalved' }
  | { kind: 'workBarelySmaller' };

export type PivotChoiceMattersScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 가를 값들. 이미 줄이 서 있다. */
  values: readonly number[];
  /**
   * 판마다 기준으로 삼을 자리. **이 배열의 길이가 곧 화면에 서는 저울의 수다.**
   *
   * 판이 하나씩 드러난다고 저울이 하나씩 생기지 않는다 — 두 판은 처음부터 나란히
   * 서 있어야 견줄 수 있다. 색판의 씨앗을 "지금까지 드러난 수" 로 잡지 않는 것과
   * 같은 까닭이다 (프로토콜 4 절).
   */
  pivots: readonly number[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 시작된 판만큼, 차례대로. 마지막이 지금 말하고 있는 판이다. */
  trials: readonly PivotChoiceMattersTrial[];
  /** 두 판을 다 굴렸나. 그러면 흐린 판이 없어져 둘이 같은 세기로 선다. */
  finished: boolean;

  step: PivotChoiceMattersStep | null;
  caption: PivotChoiceMattersCaption | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `trials` 는 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이 이미 다 갈린
 * 저울을 단 채로 서고 그 위에 algorithm 이 새로 거는 칸이 겹친다 (S-scene).
 */
type Base = Pick<PivotChoiceMattersScene, 'values' | 'pivots'>;

/**
 * 아직 아무 판도 시작하지 않은 처음 화면.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): PivotChoiceMattersScene {
  return {
    values: base.values,
    pivots: base.pivots,
    trials: [],
    finished: false,
    step: null,
    caption: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 값만 베껴 담는다 — 넘겨받은 배열을 쥐지 않는다 (S-scene). */
function nums(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
}

/**
 * 선언된 판마다 기준 자리 하나.
 *
 * **거르지 않고 줄 수를 지킨다.** 하나라도 걸러 내면 algorithm 이 걷는 판의 번호와
 * 화면의 판 번호가 한 칸씩 어긋난다. 범위 밖이면 줄 안으로 끌어당긴다.
 */
function readPivots(v: unknown, count: number): number[] {
  if (!Array.isArray(v) || count <= 0) return [];
  return v.map((entry) => {
    const raw = num((entry as { pivotIndex?: unknown } | null)?.pivotIndex) ?? 0;
    return Math.max(0, Math.min(count - 1, Math.trunc(raw)));
  });
}

// ── 장면에서 셈해지는 수들 ────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 캡션도 대괄호도 계기도 같은 함수를 부르므로
// 갈릴 자리가 없다.

/** 가르는 값의 수. 판마다의 계기가 `총수 → 남는 일` 로 띄우는 그 왼쪽 수다. */
export function totalOf(scene: PivotChoiceMattersScene): number {
  return scene.values.length;
}

/** 한 팔에 실린 칸들, 받침에서 바깥으로. 길이가 곧 그 팔의 개수다. */
export function armOf(
  trial: PivotChoiceMattersTrial,
  side: PivotArmSide,
): PivotPlacement[] {
  return trial.placed.filter((p) => p.side === side).sort((a, b) => a.slot - b.slot);
}

/** 한 팔에 실린 칸의 수. */
export function countOn(trial: PivotChoiceMattersTrial, side: PivotArmSide): number {
  return trial.placed.reduce((n, p) => (p.side === side ? n + 1 : n), 0);
}

/**
 * 남는 일 — **양쪽 중 큰 쪽.** 큰 쪽을 다시 갈라야 하기 때문이다.
 *
 * 계기의 오른쪽 수도, 대괄호가 설 팔도, 캡션의 `{remaining}` 과 `{loaded}` 도 전부
 * 이 한 함수에서 나온다.
 */
export function remainingOf(trial: PivotChoiceMattersTrial): number {
  return Math.max(countOn(trial, 'left'), countOn(trial, 'right'));
}

/**
 * 대괄호가 설 팔. 남는 일과 같은 만큼 실린 팔이다.
 *
 * 고르게 갈린 판은 양팔이 다 남는 일이라 둘 다 선다 — 그것이 "다음에 할 일은 셋짜리
 * 두 덩이" 라는 말이다. 빈 팔에는 서지 않는다.
 */
export function bracketedSides(trial: PivotChoiceMattersTrial): PivotArmSide[] {
  if (!trial.measured) return [];
  const remaining = remainingOf(trial);
  const sides: PivotArmSide[] = [];
  for (const side of ['left', 'right'] as const) {
    const count = countOn(trial, side);
    if (count > 0 && count === remaining) sides.push(side);
  }
  return sides;
}

/** 지금 말하고 있는 판의 번호. 아직 하나도 시작하지 않았으면 -1. */
export function activeIndex(scene: PivotChoiceMattersScene): number {
  return scene.trials.length - 1;
}

/** 지금 말하고 있는 판. 걸음도 캡션도 언제나 이 판의 것이다. */
export function activeTrial(scene: PivotChoiceMattersScene): PivotChoiceMattersTrial | null {
  return scene.trials[activeIndex(scene)] ?? null;
}

/**
 * 밝게 세울 판. 나머지는 흐려진다.
 *
 * 다 굴린 뒤에는 `null` — 견주라고 만든 화면이므로 어느 한쪽을 도드라지게 두지
 * 않는다. 아직 하나도 시작하지 않았을 때도 `null` 이다.
 */
export function focusOf(scene: PivotChoiceMattersScene): number | null {
  if (scene.finished) return null;
  const i = activeIndex(scene);
  return i < 0 ? null : i;
}

/** 그 판의 기준 자리. 선언되지 않은 판이면 null. */
export function pivotIndexAt(scene: PivotChoiceMattersScene, lane: number): number | null {
  return scene.pivots[lane] ?? null;
}

/** 그 판이 기준으로 삼은 값. */
export function pivotValueAt(scene: PivotChoiceMattersScene, lane: number): number | null {
  const index = pivotIndexAt(scene, lane);
  if (index === null) return null;
  return scene.values[index] ?? null;
}

export const pivotChoiceMattersScene: ScenePlan<PivotChoiceMattersScene> = {
  /**
   * 첫 장면은 저울 둘을 빈 채로 세운다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가 함께 쓰는
   * 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다
   * (S-scene). `nums` 와 `readPivots` 가 새 배열을 낸다.
   */
  initial(initialData: unknown): PivotChoiceMattersScene {
    const d = (initialData ?? {}) as { values?: unknown; trials?: unknown };
    const values = nums(d.values);
    return atStart({ values, pivots: readPivots(d.trials, values.length) });
  },

  reduce(scene: PivotChoiceMattersScene, event: FacetRuntimeEvent): PivotChoiceMattersScene {
    switch (event.type) {
      /*
       * 판 하나가 시작된다. 기준 칸이 줄에서 빠져 받침으로 내려간다.
       *
       * 몇 번째 판인가는 **이 발신이 온 차례**가 말하고 (판이 하나씩 쌓이므로
       * `trials.length` 가 곧 그 번호다), 그 번호의 기준 자리는 바탕이 쥐고 있다.
       */
      case 'pivot-lift': {
        const lane = scene.trials.length;
        const pivotIndex = pivotIndexAt(scene, lane);
        // 선언된 판보다 많이 오면 그릴 저울이 없다. 조용히 흘린다 (C2).
        if (pivotIndex === null) return scene;
        return {
          ...scene,
          trials: [...scene.trials, { placed: [], settled: false, measured: false }],
          // 줄의 맨 앞을 고르는 것이 이 조각의 최악이고, 그 판만 다르게 말한다.
          caption: pivotIndex === 0 ? { kind: 'pickFirst' } : { kind: 'pickMiddle' },
          step: { kind: 'lift' },
        };
      }

      /*
       * 칸 하나가 팔로 건너간다.
       *
       * 어느 칸이 어느 팔의 몇 번째로 가는지는 실려 오지 않는다 — 기준이 정해지면
       * 결정되는 셈이라 `splitBy` 가 말한다. 몇 번째 칸인가는 이 발신이 온 차례,
       * 곧 지금까지 쌓인 수가 말한다.
       *
       * 캡션은 그대로 둔다. 기준을 고른 말이 여섯 번의 건너감 내내 서 있어야
       * 그 건너감이 무엇 때문인지 읽힌다.
       */
      case 'partition-move': {
        const lane = activeIndex(scene);
        const trial = scene.trials[lane];
        const pivotIndex = pivotIndexAt(scene, lane);
        if (!trial || pivotIndex === null) return scene;
        const all = splitBy(scene.values, pivotIndex);
        const placed = all.slice(0, trial.placed.length + 1);
        // 건너갈 칸이 남지 않았는데 더 왔다. 화면은 그대로다 (C2).
        if (placed.length === trial.placed.length) return scene;
        return {
          ...scene,
          // 앞 장면을 제자리에서 고치지 않는다. 목록도 원소도 새로 만든다 (S-scene).
          trials: scene.trials.map((t, i) => (i === lane ? { ...t, placed } : t)),
          step: { kind: 'move' },
        };
      }

      /*
       * 저울대가 개수 차이만큼 기운다. 그 개수는 방금 실린 칸을 세면 나온다.
       *
       * 한쪽 팔이 비었는가로 할 말이 갈린다 — 그것이 이 판의 결과 그 자체다.
       */
      case 'beam-settle': {
        const lane = activeIndex(scene);
        const trial = scene.trials[lane];
        if (!trial) return scene;
        const empty = countOn(trial, 'left') === 0 || countOn(trial, 'right') === 0;
        return {
          ...scene,
          trials: scene.trials.map((t, i) => (i === lane ? { ...t, settled: true } : t)),
          caption: empty ? { kind: 'pileOneSide' } : { kind: 'splitEven' },
          step: { kind: 'settle' },
        };
      }

      /*
       * 남는 일을 짚는다. 절반 아래로 줄었는지가 이 조각이 묻는 것이다.
       */
      case 'trial-measure': {
        const lane = activeIndex(scene);
        const trial = scene.trials[lane];
        if (!trial) return scene;
        const halved = remainingOf(trial) * 2 <= totalOf(scene);
        return {
          ...scene,
          trials: scene.trials.map((t, i) => (i === lane ? { ...t, measured: true } : t)),
          caption: halved ? { kind: 'workHalved' } : { kind: 'workBarelySmaller' },
          step: { kind: 'measure' },
        };
      }

      /*
       * 두 판을 다 굴렸다. 흐려 두었던 판이 도로 밝아져 둘이 같은 세기로 선다.
       *
       * 캡션은 마지막 판이 한 말 그대로 둔다 — 그 말이 곧 견줌의 한쪽 끝이고,
       * 다른 쪽 끝은 앞 판의 계기에 그대로 서 있다.
       */
      case 'done':
        return { ...scene, finished: true, step: { kind: 'compare' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ values: scene.values, pivots: scene.pivots });

      default:
        // 이 algorithm 이 발신하는 것은 위가 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
