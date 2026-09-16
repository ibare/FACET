/**
 * SkipALayer 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * 옛 stage 에는 **다섯 자리**에 흩어져 있었다. `let` 두 개 말고는 grep 에 걸리지
 * 않는 것들이다.
 *
 * - `const trail: Array<[number, number]>` — **걸어온 자취.** 좌표 쌍의 배열이라
 *   `let` 도 아니고 이름에 상태라는 티도 없다. 이 조각의 주장("위층에서 뛰어 앞을
 *   통째로 건너뛰었다")이 통째로 여기 있었는데, 되감으면 `place()` 가 길이를 0 으로
 *   밀어 사라졌다.
 * - `type NodeState = 'idle' | 'look' | 'path' | 'reject' | 'over' | 'found'` —
 *   **선언만 있고 어디에도 저장되지 않는다.** 칠에만 쓰였다. "어느 칸을 견주었고
 *   무엇으로 판정했나" 가 `rect` 의 `fill`/`stroke` 속성 안에만 있었다.
 * - `let pinX` · `let pinLevel` — 여행자가 선 자리. 다음 걸음의 출발 그림이라
 *   `overshoot` 이 `const anchorX = pinX` 로 되읽었다.
 * - `ghostG` 의 자식 유무 — 유령 경로를 이미 놓았나. `textContent = ''` 로 비우고
 *   다시 채우는 식이라 걸음 밖에서는 알 길이 없었다.
 *
 * 여기서는 그 다섯이 `stops` · `looks` · `finished` 셋이다.
 *
 * ── 수는 한 출처에서만 나온다 — 걸어온 자취
 *
 * 이 조각의 결론은 **"네 번 보았다. 한 층짜리였다면 열 번"** 이라는 두 수다. 그
 * 수가 화면에 칠해진 칸·그어진 눈금과 갈리면 그림이 제 안에서 거짓이 된다.
 *
 * - **`done` 의 `looks` 를 받지 않는다.** 견준 자리를 `looks` 에 하나씩 쌓으므로
 *   본 횟수는 `looks.length` 다. 그 배열이 곧 칠해지는 칸의 목록이라, 캡션의 수와
 *   물든 칸의 수가 **같은 것을 두 번 말한 것**이 된다.
 * - **`flatLooks` 와 `flatColumn` 도 받지 않는다.** 층이 하나뿐이었다면 어디서
 *   멈추나는 `values` 와 `target` 이 이미 정하므로 `flatColumnOf` 가 센다.
 *   유령 경로의 눈금도 같은 함수에서 나오니, 캡션의 `{flat}` 은 실제로 그어진
 *   눈금의 개수 그 자체다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 층 번호와 자리 번호라는 **구조**만 담고, 칸 폭도 층 간격도
 * 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 문안도 담지 않는다 —
 * 무엇을 말할지와 그 자리 번호만 담고, 그 자리의 값과 문자는 그리는 쪽이 `params.t`
 * 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 여행자가 선 자리. `column` 이 null 이면 head 기둥 위다.
 *
 * 이 자리들이 이어진 것이 곧 화면의 자취선이다 — 좌표가 아니라 구조로 담는다.
 */
export type SkipStop = { level: number; column: number | null };

/** 견준 뒤의 판정. 값과 견준 결과가 그대로 칠이 된다. */
export type SkipVerdict =
  /** 찾는 값보다 작았다 — 그리로 뛰었다. */
  | 'path'
  /** 찾는 값보다 컸다 — 지나쳤으니 한 층 내려섰다. */
  | 'over'
  /** 같았다. */
  | 'found';

/** 견준 자리 하나. 이 목록의 길이가 곧 "몇 번 보았나" 다. */
export type SkipLook = { level: number; column: number; verdict: SkipVerdict };

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * `from` 을 함께 담는 까닭 — 뜀도 내려섬도 **지나간 자리에서 출발**하는데, 그것을
 * `prev` 에서 꺼내 쓰면 "`prev` 는 고르는 데만" 을 어긴다 (S-scene). 그래서 출발
 * 자리를 계기값으로 장면에 남긴다.
 */
export type SkipALayerStep =
  /** 여행자가 head 기둥 꼭대기에 선다. 흐를 것이 없다. */
  | { kind: 'begin' }
  /** 다음 값이 작아 그리로 뛴다. */
  | { kind: 'leap'; from: SkipStop; to: SkipStop }
  /** 뛰어 보았다가 지나쳐 되돌아오고, 그 자리에서 한 층 내려선다. */
  | { kind: 'overshoot'; from: SkipStop; over: number; to: SkipStop }
  /** 이 층에 다음이 없어 그냥 내려선다. */
  | { kind: 'descend'; from: SkipStop; to: SkipStop }
  /** 찾았다. */
  | { kind: 'found'; from: SkipStop; to: SkipStop }
  /** 한 층짜리였다면 밟았을 길이 자라 나온다. */
  | { kind: 'reveal' };

/**
 * 캡션이 말할 것. 문안이 아니라 **무엇을 말할지와 그 자리 번호**다.
 *
 * 값을 담지 않고 자리 번호를 담는 까닭 — 그 자리의 값은 `values` 가 이미 쥐고
 * 있고 화면의 칸에도 그 값이 쓰인다. 캡션에 수를 따로 실으면 두 자리에서 말하는
 * 꼴이 된다.
 */
export type SkipALayerCaption =
  | { kind: 'start' }
  | { kind: 'leap'; column: number }
  | { kind: 'overshoot'; column: number }
  | { kind: 'laneEnd' }
  | { kind: 'found'; level: number; column: number }
  | { kind: 'done' };

export type SkipALayerScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 오름차순 값들. 자리 번호(column)가 곧 이 배열의 인덱스다. */
  values: readonly number[];
  /** 값마다의 탑 높이. 1 이상의 정수로 좁혀 둔 것이라 그리는 쪽이 다시 자르지 않는다. */
  heights: readonly number[];
  /** 찾는 값. 여행자가 들고 다닌다. */
  target: number;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /**
   * 여행자가 선 자리들, 순서대로. 마지막이 지금 자리이고 비어 있으면 아직 안 섰다.
   *
   * **남는 자취**다 — 위층에서 뛴 거리와 내려선 자리가 쌓이는 것이 이 조각의 주장
   * 자체이므로 정적 그리기에도 들어간다 (S-scene).
   */
  stops: readonly SkipStop[];
  /**
   * 견준 자리와 그 판정. **길이가 곧 "몇 번 보았나"** 다.
   *
   * 화면의 칠도 캡션의 수도 여기 하나에서 나온다.
   */
  looks: readonly SkipLook[];
  /** 한 층짜리 리스트와 견주는 유령 경로가 놓였나. */
  finished: boolean;

  step: SkipALayerStep | null;
  caption: SkipALayerCaption | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `stops` · `looks` · `finished` 는 전부 걸어온 자취라 여기 넣지 않는다 — 넣으면
 * 되감은 화면이 이미 물든 칸과 자취선을 단 채로 선다 (S-scene).
 */
type Base = Pick<SkipALayerScene, 'values' | 'heights' | 'target'>;

/**
 * 되돌린 뒤의 장면.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): SkipALayerScene {
  return {
    values: base.values,
    heights: base.heights,
    target: base.target,
    stops: [],
    looks: [],
    finished: false,
    step: null,
    caption: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function nums(v: unknown): number[] {
  return Array.isArray(v)
    ? (v as unknown[]).filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    : [];
}

/**
 * 높이를 값의 수에 맞추고 1 이상의 정수로 좁힌다.
 *
 * **좁히는 자리를 여기 하나로 둔다.** 옛 stage 는 `Math.max(1, Math.floor(h ?? 1))`
 * 를 제 안에서 따로 했고 algorithm 은 날것을 그대로 썼다 — 잣대가 둘이면 층 구성이
 * 갈릴 자리가 생긴다 (`coin-flip-height` 가 같은 데서 걸렸다).
 */
function readHeights(rawHeights: unknown, count: number): number[] {
  const given = nums(rawHeights);
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const h = given[i];
    out.push(typeof h === 'number' ? Math.max(1, Math.trunc(h)) : 1);
  }
  return out;
}

/**
 * 층별 구성. `lanes[level]` 은 그 층에 선 값들의 자리 번호다.
 *
 * algorithm 이 같은 규칙으로 같은 자료를 세고 있다 — **베끼는 것이 아니라 세는
 * 것**이라 둘이 갈릴 수 없다.
 */
export function lanesOf(heights: readonly number[]): number[][] {
  let top = 0;
  for (const h of heights) if (h > top) top = h;
  const lanes: number[][] = [];
  for (let level = 0; level < top; level += 1) {
    const columns: number[] = [];
    for (let i = 0; i < heights.length; i += 1) if (heights[i] > level) columns.push(i);
    lanes.push(columns);
  }
  return lanes;
}

/** 가장 높은 층의 번호. 층이 하나도 없으면 0. */
export function topLevelOf(heights: readonly number[]): number {
  let top = 0;
  for (const h of heights) if (h > top) top = h;
  return Math.max(0, top - 1);
}

/**
 * 층이 하나뿐인 리스트로 처음부터 훑었다면 어디서 멈추나 — 대조의 상대.
 *
 * `done` 이 실어 오는 `flatColumn` 을 받지 않고 여기서 센다. 그래야 유령 경로의
 * 눈금 수와 캡션의 `{flat}` 이 한 출처에서 나온다.
 */
export function flatColumnOf(values: readonly number[], target: number): number {
  for (let i = 0; i < values.length; i += 1) if (values[i] >= target) return i;
  return Math.max(0, values.length - 1);
}

/** 여행자가 지금 선 자리. 아직 안 섰으면 head 기둥 꼭대기. */
export function currentStop(scene: SkipALayerScene): SkipStop {
  const last = scene.stops[scene.stops.length - 1];
  return last ?? { level: topLevelOf(scene.heights), column: null };
}

export const skipALayerScene: ScenePlan<SkipALayerScene> = {
  /**
   * 첫 장면은 바탕만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가 함께 쓰는
   * 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다
   * (S-scene). `nums` 와 `readHeights` 가 새 배열을 낸다.
   */
  initial(initialData: unknown): SkipALayerScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const values = nums(d.values);
    return atStart({
      values,
      heights: readHeights(d.heights, values.length),
      target: num(d.target) ?? 0,
    });
  },

  reduce(scene: SkipALayerScene, event: FacetRuntimeEvent): SkipALayerScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      /*
       * 여행자가 head 기둥의 꼭대기 층에 선다. 한 회차의 첫 걸음이므로 자취를
       * 새로 깐다.
       *
       * `p.level` 을 쓰지 않는다 — 꼭대기가 몇 층인지는 `heights` 가 이미 정한다.
       * `p.target` 도 마찬가지로 바탕이 쥐고 있다.
       */
      case 'seek-begin':
        return {
          ...scene,
          stops: [{ level: topLevelOf(scene.heights), column: null }],
          looks: [],
          finished: false,
          step: { kind: 'begin' },
          caption: { kind: 'start' },
        };

      // 다음 값이 찾는 값보다 작다 — 그 자리로 뛴다. 견준 자리가 하나 쌓인다.
      case 'leap': {
        const level = num(p.level);
        const column = num(p.column);
        if (level === null || column === null) return scene;
        const from = currentStop(scene);
        const to: SkipStop = { level, column };
        return {
          ...scene,
          stops: [...scene.stops, to],
          looks: [...scene.looks, { level, column, verdict: 'path' }],
          step: { kind: 'leap', from, to },
          caption: { kind: 'leap', column },
        };
      }

      /*
       * 한 층 내려선다. 자리는 그대로이고 층만 하나 낮아진다.
       *
       * 내려서는 자리를 `p.column` 이 아니라 **자취의 끝**에서 꺼낸다 — 자취선은
       * 끊기지 않고 이어져야 하고, 그 이음매의 정본은 이 장면이 쥔 `stops` 다.
       */
      case 'step-down': {
        const level = num(p.level);
        const toLevel = num(p.toLevel);
        if (level === null || toLevel === null) return scene;
        const from = currentStop(scene);
        const to: SkipStop = { level: toLevel, column: from.column };
        const over = num(p.overColumn);

        // 이 층에 다음이 없어 내려서는 경우 — 견준 것이 없으니 자취에 쌓지 않는다.
        if (over === null) {
          return {
            ...scene,
            stops: [...scene.stops, to],
            step: { kind: 'descend', from, to },
            caption: { kind: 'laneEnd' },
          };
        }

        // 보고 지나쳐서 내려서는 경우 — 그 칸이 견준 자리로 남는다.
        return {
          ...scene,
          stops: [...scene.stops, to],
          looks: [...scene.looks, { level, column: over, verdict: 'over' }],
          step: { kind: 'overshoot', from, over, to },
          caption: { kind: 'overshoot', column: over },
        };
      }

      case 'found': {
        const level = num(p.level);
        const column = num(p.column);
        if (level === null || column === null) return scene;
        const from = currentStop(scene);
        const to: SkipStop = { level, column };
        return {
          ...scene,
          stops: [...scene.stops, to],
          looks: [...scene.looks, { level, column, verdict: 'found' }],
          step: { kind: 'found', from, to },
          caption: { kind: 'found', level, column },
        };
      }

      /*
       * 한 층짜리 리스트였다면 밟았을 길을 눕힌다.
       *
       * `p.looks` · `p.flatLooks` · `p.flatColumn` 셋을 전부 버린다. 본 횟수는
       * `looks` 가 쥐고, 유령 경로가 어디까지 가는지는 `values` 와 `target` 이
       * 정한다 (`flatColumnOf`).
       */
      case 'done':
        return { ...scene, finished: true, step: { kind: 'reveal' }, caption: { kind: 'done' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ values: scene.values, heights: scene.heights, target: scene.target });

      default:
        // 이 algorithm 이 발신하는 것은 위 여섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
