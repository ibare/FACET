/**
 * greedyCanFail 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * 옛 projector 의 `let` 은 `coins` 와 `target` 둘뿐이었고 그것은 바탕이다. **진짜
 * 상태는 전부 stage 안에 있었고, 그중 어느 것도 `let` 이 아니었다** — `const lanes =
 * new Map<GreedyLane, LaneParts>()` 한 줄에 DOM 손잡이와 뜻이 함께 묶여 있었다
 * (프로토콜 3-1 의 ⑤).
 *
 * - **`LaneParts.placed: number`** — 그 줄이 몇 개를 놓았나. **이 조각의 결론인
 *   "개수" 그 자체**인데 `const` Map 안의 숫자 필드라 `let` grep 을 통과한다.
 * - **`LaneParts.settled: boolean`** — 그 줄이 끝났나. `markSettled` 가 이미 세운
 *   눈금을 두 번 긋지 않게 하는 암묵 분기였다 (③ 과 같은 꼴).
 * - **`LaneParts.pillNum.textContent`** — **남은 몫이 문자열에만 있었다.** 화면에
 *   나란히 뜨는 수인데 밖에서 읽을 길이 없었고, 되감아 세운 직후에는 옛 화면의 수다.
 * - **`LaneParts.countEl.textContent`** — `4 개` · `2 개`. 이 조각이 말하려는 차이가
 *   그대로 여기 있었는데 `showVerdict` 가 한 번 써 넣는 문자열이 전부였다.
 * - **`LaneParts.pillBox` 의 `fill` · `stroke` 속성** — 끝난 줄인가를 칠로만 적었다.
 * - **놓인 동전 노드들** — 어느 줄에 어떤 액면이 몇 번째로 놓였나가 `root` 에 붙은
 *   `<g>` 들에만 있었다. 되감기는 `build()` 로 통째로 헐어 다시 세우는 수밖에 없었다.
 * - **눈금 · 잣대 · 넘어간 만큼** — `markSettled` 와 `showVerdict` 가 `root` 에
 *   덧붙이던 선들. **이 조각의 결말 둘이 나란히 남는 자리**인데 그것을 아는 코드가
 *   없어 명령을 다시 밟아야만 복원됐다.
 * - **`const shelf = new Map<number, ShelfCoin>()`** — 액면마다의 자리·지름·칠.
 *   바탕에서 나오는 값인데 `build()` 안에서만 셈해 두고 `takeCoins` 가 되읽었다.
 * - **`let cell`** — 칸 폭. `showGoal` 이 정하고 그 뒤 모든 자리가 여기 매였다.
 *
 * 여기서는 그 아홉이 `picks` · `settled` · `judged` · `capacity` 넷이다. 줄마다
 * **집은 액면의 목록**만 있으면 개수도 남은 몫도 자리도 전부 셈으로 나온다.
 *
 * ── 수는 한 출처에서만 나온다
 *
 * 이 조각은 **두 줄의 수를 나란히 띄워 견주게 한다.** 남은 몫 둘, 개수 둘, 그 차이,
 * 줄의 길이, 잣대의 길이, 캡션의 수가 한 화면에 함께 선다. 그것들이 갈리면 그림이
 * 제 안에서 거짓이 되므로 **아래 셈 함수 여섯을 모두가 지난다** (프로토콜 4 절
 * "화면에 나란히 뜨는 수는 한 함수를 지나야 한다").
 *
 * 그래서 payload 에서 걷어낸 것이 많다.
 *
 * - `greedyRemaining` · `fewestRemaining` — `target - 집은 것의 합`. 구조에서 세진다.
 * - `count` · `greedyCount` · `fewestCount` · `difference` — 집은 것의 길이와 그 차.
 * - `round` — **차례는 발신이 오는 순서가 이미 말한다.** 집을 때마다 하나씩 쌓인다.
 * - `lane` — 남은 몫이 0 인데 아직 눈금이 없는 줄. 장면이 가려낸다.
 * - `target` — 바탕이 쥐고 있다.
 *
 * 남은 것은 `greedyValue` · `fewestValue` 와 `capacity` 뿐이다.
 *
 * - **집은 액면은 걸음이 내리는 판정이라 싣는다.** 어느 줄이 어느 동전을 집는가가
 *   곧 이 조각의 두 규칙이다.
 * - **`capacity` 도 싣는다.** 무대의 칸 예산(두 줄 중 더 긴 쪽의 개수)이라 첫 동전이
 *   놓이기 전에 정해져야 하는데, 장면은 앞일을 셀 수 없다. 잣대대로라면 *바탕 +
 *   순수 함수*라 B(함수를 내주고 장면이 부른다)로 가야 하지만, **여기서 내주어야 할
 *   함수는 `planGreedy` + `planFewest`, 곧 이 조각의 알고리즘 그 자체다.** 그러면
 *   발신이 장식이 되므로 프로토콜의 단서대로 멈추고 A 로 남긴다. 화면에 뜨는 수도
 *   아니다 — 칸 폭 하나를 역산할 뿐이다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 줄과 차례라는 **구조**만 담고 칸 폭도 동전의 지름도 캔버스에서
 * 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지만
 * 담고 수와 문자는 그리는 쪽이 `params.t` 로 만든다 (C10). 그래서 캡션에는 인자가
 * 하나도 없다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 두 줄. `greedy` 는 큰 것부터, `fewest` 는 개수가 가장 적게. */
export type GreedyLane = 'greedy' | 'fewest';

/** 화면에 선 차례. 위가 `greedy`, 아래가 `fewest` 다. */
export const GREEDY_LANES: readonly GreedyLane[] = ['greedy', 'fewest'];

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 싣지 않는다 — 날아오는 동전의 출발 자리도, 바뀌기 전의 남은 몫도
 * (`지금 남은 몫 + 방금 집은 액면`) 전부 `next` 에서 되셈된다. 그러니 `prev` 를
 * 들출 까닭이 없다 (S-scene).
 */
export type GreedyCanFailStep =
  /** 목표가 두 줄로 내려간다. */
  | { kind: 'goal' }
  /** 움직인 줄들이 선반에서 동전을 하나씩 집는다. 둘 다면 나란히 움직인다. */
  | { kind: 'pick'; moved: readonly GreedyLane[] }
  /** 먼저 끝난 줄에 눈금이 선다. */
  | { kind: 'settle'; lane: GreedyLane }
  /** 두 줄 밑에 잣대가 그어지고 넘어간 만큼이 붉게 남는다. */
  | { kind: 'judge' };

/**
 * 캡션이 말할 것. 인자가 없다 — 수는 전부 장면에서 셈해진다.
 *
 * 수를 여기 실으면 화면의 동전·잣대와 갈릴 자리가 생긴다.
 */
export type GreedyCanFailCaption =
  | { kind: 'setup' }
  | { kind: 'goal' }
  | { kind: 'fork' }
  | { kind: 'round' }
  | { kind: 'alone' }
  | { kind: 'settled' }
  | { kind: 'verdict' };

export type GreedyCanFailScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 선반에 놓일 액면. 값만 베껴 담는다. */
  coins: readonly number[];
  /** 두 줄이 함께 만들어야 하는 금액. */
  target: number;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 무대의 칸 예산. `goal-set` 이 정한다. 0 이면 아직 목표가 내려오지 않았다. */
  capacity: number;
  /** 목표가 두 줄로 내려왔나. 그 전에는 남은 몫 눈금이 비어 있다. */
  started: boolean;
  /** 줄마다 집은 액면, 차례대로. **길이가 곧 개수다.** */
  picks: Record<GreedyLane, readonly number[]>;
  /** 눈금이 선 줄. **남는 강조**라 정적 그리기에도 들어간다. */
  settled: Record<GreedyLane, boolean>;
  /** 두 줄을 견주었나. 잣대와 넘어간 만큼이 여기서 선다. */
  judged: boolean;

  step: GreedyCanFailStep | null;
  caption: GreedyCanFailCaption | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `capacity` 도 `picks` 도 여기 들지 않는다 — 전부 걸어오며 얻은 것이라 되감기에
 * 그대로 넘기면 되감은 화면이 이미 다 굴러간 채로 선다 (S-scene). 되감기 다음
 * 걸음이 `goal-set` 이므로 칸 예산은 곧바로 다시 온다.
 */
type Base = Pick<GreedyCanFailScene, 'coins' | 'target'>;

/**
 * 아직 아무것도 집지 않은 처음 화면.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): GreedyCanFailScene {
  return {
    coins: base.coins,
    target: base.target,
    capacity: 0,
    started: false,
    picks: { greedy: [], fewest: [] },
    settled: { greedy: false, fewest: false },
    judged: false,
    step: null,
    caption: { kind: 'setup' },
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

// ── 장면에서 셈해지는 수들 ────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 남은 몫 눈금도 잣대의 길이도 캡션의 수도 같은
// 함수를 부르므로 갈릴 자리가 없다.

/** 그 줄이 집은 개수. 줄의 길이가 곧 이것이다. */
export function countOf(scene: GreedyCanFailScene, lane: GreedyLane): number {
  return scene.picks[lane].length;
}

/** 그 줄이 아직 만들어야 하는 몫. 오른쪽 눈금에 뜨는 수다. */
export function remainingOf(scene: GreedyCanFailScene, lane: GreedyLane): number {
  return scene.picks[lane].reduce((left, value) => left - value, scene.target);
}

/** 그 줄이 방금 집은 액면. 아직 하나도 집지 않았으면 null. */
export function lastPickOf(scene: GreedyCanFailScene, lane: GreedyLane): number | null {
  const picks = scene.picks[lane];
  return picks[picks.length - 1] ?? null;
}

/**
 * 넘어간 개수 — 큰 것부터 집은 줄이 더 쓴 만큼.
 *
 * 붉은 잣대의 길이도 캡션의 `{d}` 도 이 한 함수에서 나온다. 음수면 넘어간 것이 없다.
 */
export function excessOf(scene: GreedyCanFailScene): number {
  return countOf(scene, 'greedy') - countOf(scene, 'fewest');
}

/** 이번 걸음에 움직인 줄들. 걸음이 아니면 빈 목록이다. */
export function movedLanes(scene: GreedyCanFailScene): readonly GreedyLane[] {
  return scene.step?.kind === 'pick' ? scene.step.moved : [];
}

/** 이번 걸음에 눈금이 선 줄. 그 걸음이 아니면 null. */
export function settlingLane(scene: GreedyCanFailScene): GreedyLane | null {
  return scene.step?.kind === 'settle' ? scene.step.lane : null;
}

/**
 * 선반에 설 액면. 큰 것부터, 겹치지 않게.
 *
 * **바탕에서 한 번에 센다.** 색판의 씨앗이 이 길이라, "지금까지 드러난 수" 로 잡으면
 * 액면이 하나 더 드러날 때 이미 칠한 동전의 색이 통째로 바뀐다 (프로토콜 4 절).
 */
export function denominationsOf(scene: GreedyCanFailScene): number[] {
  return [...new Set(scene.coins)].filter((c) => c > 0).sort((a, b) => b - a);
}

export const greedyCanFailScene: ScenePlan<GreedyCanFailScene> = {
  /**
   * 첫 장면은 선반과 목표만 세운다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가 함께 쓰는
   * 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다
   * (S-scene). `nums` 가 새 배열을 낸다.
   */
  initial(initialData: unknown): GreedyCanFailScene {
    const d = (initialData ?? {}) as { coins?: unknown; target?: unknown };
    return atStart({ coins: nums(d.coins), target: num(d.target) ?? 0 });
  },

  reduce(scene: GreedyCanFailScene, event: FacetRuntimeEvent): GreedyCanFailScene {
    switch (event.type) {
      /*
       * 목표가 두 줄로 내려간다. 여기서부터 둘은 같은 데서 출발한다.
       *
       * 실려 오는 것은 칸 예산 하나뿐이다. 목표 금액은 바탕이 쥐고 있다.
       */
      case 'goal-set': {
        const p = event.payload as { capacity?: unknown } | undefined;
        return {
          ...scene,
          capacity: Math.max(0, Math.trunc(num(p?.capacity) ?? 0)),
          started: true,
          caption: { kind: 'goal' },
          step: { kind: 'goal' },
        };
      }

      /*
       * 두 줄이 각자의 규칙대로 동전을 집는다.
       *
       * 이미 끝난 줄의 필드는 아예 오지 않으므로 **어느 줄이 움직였나는 실려 온 필드가
       * 말한다.** 몇 번째 집음인가는 이 발신이 온 차례, 곧 지금까지 쌓인 수가 말한다.
       */
      case 'fork-picked':
      case 'round-picked': {
        const p = event.payload as { greedyValue?: unknown; fewestValue?: unknown } | undefined;
        const taken: Partial<Record<GreedyLane, number>> = {};
        const greedy = num(p?.greedyValue);
        const fewest = num(p?.fewestValue);
        if (greedy !== null) taken.greedy = greedy;
        if (fewest !== null) taken.fewest = fewest;
        const moved = GREEDY_LANES.filter((lane) => taken[lane] !== undefined);
        // 아무 줄도 움직이지 않는 집음은 화면에 할 말이 없다. 조용히 흘린다 (C2).
        if (moved.length === 0) return scene;

        // 앞 장면을 제자리에서 고치지 않는다. 목록도 묶음도 새로 만든다 (S-scene).
        const picks: Record<GreedyLane, readonly number[]> = { ...scene.picks };
        for (const lane of moved) picks[lane] = [...scene.picks[lane], taken[lane] as number];

        const both = moved.length === GREEDY_LANES.length;
        return {
          ...scene,
          picks,
          caption: both
            ? event.type === 'fork-picked'
              ? { kind: 'fork' }
              : { kind: 'round' }
            : { kind: 'alone' },
          step: { kind: 'pick', moved },
        };
      }

      /*
       * 한 줄이 끝났는데 다른 줄은 아직 모자란 자리.
       *
       * 어느 줄인가는 실려 오지 않는다 — **남은 몫이 0 인데 아직 눈금이 없는 줄**이
       * 그것이고, 그 둘 다 장면에 있다. 발신은 이 어긋남에서 한 번 멈추라는 말만 한다.
       */
      case 'lane-settled': {
        const lane = GREEDY_LANES.find(
          (l) => !scene.settled[l] && countOf(scene, l) > 0 && remainingOf(scene, l) === 0,
        );
        // 끝난 줄이 없는데 왔다. 화면은 그대로다 (C2).
        if (lane === undefined) return scene;
        return {
          ...scene,
          settled: { ...scene.settled, [lane]: true },
          caption: { kind: 'settled' },
          step: { kind: 'settle', lane },
        };
      }

      /*
       * 두 줄을 나란히 견준다. 개수도 차이도 집은 것의 길이에서 나온다.
       *
       * 아직 눈금이 없는 줄에도 여기서 눈금이 선다 — **두 결말이 다 끝난 화면에
       * 나란히 남아야** 이 조각의 주장이 선다.
       */
      case 'verdict': {
        if (countOf(scene, 'greedy') === 0 || countOf(scene, 'fewest') === 0) return scene;
        return {
          ...scene,
          settled: { greedy: true, fewest: true },
          judged: true,
          caption: { kind: 'verdict' },
          step: { kind: 'judge' },
        };
      }

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ coins: scene.coins, target: scene.target });

      default:
        // 이 algorithm 이 발신하는 것은 위가 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
