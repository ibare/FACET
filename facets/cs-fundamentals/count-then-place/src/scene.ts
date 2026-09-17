/**
 * countThenPlace 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 세로로 읽는다. 위에 입력이 늘어서 있고, 값을 하나 읽을 때마다 눈금이 그 값의
 * 열로 떨어져 쌓인다. 다 세면 쌓인 더미가 그대로 누워 결과 배열의 구역이 되고,
 * 마지막에 입력 타일이 제 구역으로 곧장 날아가 앉는다.
 *
 * ── 숨은 상태는 어디에 있었나
 *
 * 옮기기 전 projector 에는 `let` 이 하나도 없었고, stage 의 `let` 은 열다섯 중
 * 열셋이 DOM 손잡이나 좌표 상수였다. 그런데 **이 조각이 말하려는 수는 전부 그
 * 손잡이 안에** 있었다.
 *
 * - **값마다 몇 개를 세었나** — `ticksByValue: SVGRectElement[][]`. 주석이
 *   "쌓인 순서가 곧 그 값 구역 안의 자리 순서다" 라고 스스로 밝히고 있는데,
 *   그 순서를 적어 둔 곳이 **DOM 노드 배열의 길이**뿐이었다 (`column.length`).
 *   `const` 도 아니고 `let` 이지만 담긴 것이 요소라 셈으로 보이지 않는다. 이 조각의
 *   주장이 바로 그 셈이다 — 이제 `counted` 가 말하고 `reckon` 이 센다.
 * - **다음에 앉을 자리 번호** — `chipLabel.textContent`. `String(step.slot + 1)` 로
 *   화면 글자에만 얹혀 있었고, 다음 걸음에서 그 위에 덮어썼다. 되짚어 세운 직후에는
 *   그것이 아직 옛 화면의 수다. 이제 `reckon` 의 `nextSlot` 이다.
 * - **눈금이 아직 쌓여 있나, 이미 누웠나** — `tick.style.transform`. 좌표가 아니라
 *   *그 눈금이 어느 국면에 있나* 를 화면이 혼자 알고 있었다 (프로토콜 3-1 의 ⑤
 *   마지막 줄). 이제 `settled` 가 값마다 그것을 말한다.
 * - **어느 타일이 이미 놓였나** — `tile.style.transform`. 위와 같다. 이제 `placed`.
 * - **칩이 아직 서 있나** — `chip.style.opacity`. 구역을 다 쓰면 잦아들어 사라지는데,
 *   그 "다 썼다" 를 적어 둔 곳이 opacity 뿐이었다. 이제 `nextSlot[v] === null`.
 * - **커서가 아직 화면에 있나** — `cursor` 의 opacity. `signalDone()` 이 한 번
 *   내리면 되돌리는 명령이 없었다. 이제 `cursor: number | null`.
 *
 * ── 쌓이던 것이 주장이었다
 *
 * 눈금은 걷어내는 명령이 없어 계속 쌓였다. 그것을 "되돌림이 빠진 자리" 로 읽어
 * 장면에서 깔끔히 지우면 **이 조각이 말하던 것이 통째로 사라진다** — 몇 개를
 * 세었나가 곧 자리 수이고, 세로로 쌓인 더미가 그대로 누워 구역이 되는 것이 이
 * 조각의 논증이다. 그래서 `counted` 를 일부러 장면에 올려 정적 그리기가 매번
 * 다시 세우게 했다 (프로토콜 4 절의 "쌓이던 것이 사실은 주장이었을 수 있다").
 *
 * ── 화면에 나란히 뜨는 수는 한 함수를 지난다
 *
 * 칸마다의 셈 · 앞에서부터 더한 시작 자리 · 칩이 가리키는 다음 자리 · 눈금이
 * 누울 자리 — 넷이 한 화면에 함께 뜬다. 전부 `reckon()` 하나에서 나온다. 걸음이
 * 그 수를 실어 오지 않는 것도 같은 까닭이다 (아래).
 *
 * ── 걸음은 수를 싣지 않는다
 *
 * 옛 발신은 `height` · `start` · `count` · `slot` · `bucketFull` 을 실어 왔다.
 * 전부 **구조에서 세지는 것**이다 — 눈금이 몇 개 쌓였나, 그것을 앞에서부터 더하면
 * 얼마인가, 그 구역에 몇 개가 앉았나. 장면이 세면 화면과 수가 같은 출처가 된다
 * (프로토콜 4 절의 잣대표 첫 줄). 걸음이 말하는 것은 **어느 입력 칸의 차례인가**
 * 뿐이고 그것은 `target: index:<i>` 가 이미 말한다.
 *
 * 국면을 알리던 `caption-changed` 도 걷어냈다. 어느 국면인가는 **어느 발신이
 * 왔는가**가 이미 말하고 (`count-tick` 이면 세는 중), 그 발신은 화면을 바꾸지
 * 않으면서 걸음만 하나 세워 띠에 0ms 눈금을 만들고 있었다.
 *
 * 좌표는 담지 않는다. 칸 수와 값의 종류 수가 자리를 정하므로 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지만 담고 문자는
 * 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import { toIndexArray, type FacetRuntimeEvent, type ScenePlan } from '@ffacet/core/runtime';

/**
 * 캡션이 말할 것. 문안이 아니라 무엇을 말할지다 (C10).
 *
 * 인자가 없어 갈래 이름 하나로 족하다 — 네 문안 어디에도 자리표가 없다.
 */
export type CountThenPlaceCaption = 'count' | 'settle' | 'place' | 'done';

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데** 쓰고, 운동의 **출발 그림**도
 * 여기서 셈한다.
 *
 * 커서는 한 자리에서 다른 자리로 걸어가므로 출발 자리가 꼭 필요하다. 그것을
 * `prev` 에서 꺼내면 "`prev` 는 고르는 데만" 을 어기므로 (S-scene), `reduce` 가
 * 앞 장면에서 읽어 여기 싣는다.
 */
export type CountThenPlaceStep =
  /** 입력 `at` 을 읽어 눈금 하나가 그 값의 열로 떨어진다. */
  | { readonly kind: 'count'; readonly at: number; readonly from: number }
  /** 그 값의 더미가 통째로 누워 결과 배열의 구역이 된다. */
  | { readonly kind: 'settle'; readonly value: number }
  /** 입력 `at` 의 타일이 제 번호로 곧장 간다. */
  | { readonly kind: 'place'; readonly at: number; readonly from: number }
  /** 다 놓았다. 커서가 물러나고 결과 줄을 왼쪽부터 훑는다. */
  | { readonly kind: 'done'; readonly from: number | null };

export type CountThenPlaceScene = {
  /**
   * 처음 늘어선 값들. 칸 수와 폭을 정하고 `rewind` 가 여기로 돌아온다.
   *
   * 모든 장면이 같은 배열을 나눠 쥐지만 **누구도 고치지 않는다** — 고치면 과거가
   * 함께 바뀐다 (S-scene 의 Exception).
   */
  readonly values: readonly number[];
  /** 값의 종류 수. 눈금 열의 개수이고 색판의 씨앗이다. 선언이 정하고 끝까지 그대로다. */
  readonly range: number;
  /**
   * 읽어서 눈금이 된 입력 자리들. 읽은 차례대로다.
   *
   * 길이가 곧 "몇 개를 세었나" 이고, 값별로 나누면 그 값의 눈금 수다. 되돌리는
   * 명령이 없어 쌓이던 자취인데, **그 누적이 이 조각의 주장**이라 일부러 장면에
   * 올린다.
   */
  readonly counted: readonly number[];
  /** 앞에서부터 몇 종류가 시작 자리를 얻었나 (0 .. range). 굳은 열은 눈금이 누워 있다. */
  readonly settled: number;
  /** 결과 자리에 앉은 입력 자리들. 앉은 차례대로 — 몇 번째 자리인지는 `reckon` 이 센다. */
  readonly placed: readonly number[];
  /** 커서가 겨눈 입력 자리. 다 놓고 나면 `null` — 읽을 것이 없으니 물러난다. */
  readonly cursor: number | null;
  readonly step: CountThenPlaceStep | null;
  readonly caption: CountThenPlaceCaption;
};

/** 눈금 하나 — 어느 입력에서 왔고, 그 값의 몇 번째로 쌓였나. */
export type CountTick = {
  readonly index: number;
  readonly value: number;
  /** 그 값의 열에서 몇 번째 (0-based). 구역 안의 자리 차례이기도 하다. */
  readonly height: number;
};

/** 결과 자리에 앉은 타일 하나. */
export type CountSeat = {
  readonly index: number;
  readonly value: number;
  readonly slot: number;
};

/**
 * 장면 하나에서 나오는 셈 전부.
 *
 * **화면에 나란히 뜨는 수는 전부 여기를 지난다.** 칸마다의 셈과 앞에서부터 더한
 * 시작 자리가 각자 셈해지면 언젠가 갈린다 (프로토콜 4 절).
 */
export type CountThenPlaceReckoning = {
  /** 값마다 지금까지 센 눈금 수. */
  readonly counts: readonly number[];
  /** 값마다의 시작 자리. `counts` 를 앞에서부터 더한 것. */
  readonly starts: readonly number[];
  /** 쌓인 눈금들. 읽은 차례대로. */
  readonly ticks: readonly CountTick[];
  /** 앉은 타일들. 앉은 차례대로. */
  readonly seats: readonly CountSeat[];
  /** 값마다 다음에 앉을 자리. 구역을 다 썼거나 애초에 없으면 `null` (칩이 서지 않는다). */
  readonly nextSlot: readonly (number | null)[];
};

/**
 * 장면을 셈으로 편다. 순수 함수 — 장면과 셈이 갈릴 자리가 없다.
 *
 * 세 번 훑는다. 눈금을 쌓으며 값마다 세고, 그 셈을 앞에서부터 더해 시작 자리를
 * 얻고, 앉은 차례대로 구역 안의 자리를 나눠 준다. 이것이 계수 배치 자체다.
 */
export function reckon(scene: CountThenPlaceScene): CountThenPlaceReckoning {
  const range = Math.max(0, scene.range);
  const counts = new Array<number>(range).fill(0);
  const ticks: CountTick[] = [];
  for (const index of scene.counted) {
    const value = scene.values[index];
    if (typeof value !== 'number' || value < 0 || value >= range) continue;
    ticks.push({ index, value, height: counts[value] });
    counts[value] += 1;
  }

  const starts = new Array<number>(range).fill(0);
  let acc = 0;
  for (let value = 0; value < range; value += 1) {
    starts[value] = acc;
    acc += counts[value];
  }

  const taken = new Array<number>(range).fill(0);
  const seats: CountSeat[] = [];
  for (const index of scene.placed) {
    const value = scene.values[index];
    if (typeof value !== 'number' || value < 0 || value >= range) continue;
    seats.push({ index, value, slot: starts[value] + taken[value] });
    taken[value] += 1;
  }

  const nextSlot = counts.map((count, value) =>
    taken[value] >= count ? null : starts[value] + taken[value],
  );

  return { counts, starts, ticks, seats, nextSlot };
}

/**
 * 걸음이 **바꾸지 않는** 부분. 첫 장면이 한 번 정한다.
 *
 * `counted` · `settled` · `placed` 를 여기 넣지 않는다. 그것들은 걸어온 자취라,
 * 바탕으로 묶어 되감기에 넘기면 되감은 화면이 눈금을 쌓은 채로 서고 그 위에
 * algorithm 이 처음부터 다시 센다. 타입으로 좁혀 구조적으로 못 넘어가게 하고,
 * 부르는 쪽은 **객체 리터럴**로 넘긴다 — 변수로 넘기면 초과 속성 검사가 돌지
 * 않아 좁힌 타입이 아무것도 막지 못한다.
 */
type CountThenPlaceBase = Pick<CountThenPlaceScene, 'values' | 'range'>;

/**
 * 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다.
 *
 * 커서는 첫 칸을 겨눈 채로 선다 — 옛 stage 의 `build()` 도 그랬고, 그래야 첫
 * 걸음에서 커서가 없다가 튀어나오지 않는다.
 */
function atStart(base: CountThenPlaceBase): CountThenPlaceScene {
  return {
    values: base.values,
    range: base.range,
    counted: [],
    settled: 0,
    placed: [],
    cursor: base.values.length > 0 ? 0 : null,
    step: null,
    // 첫 화면부터 무엇을 할 참인지 말한다. 국면을 알리던 발신이 없어졌으므로
    // 여기서 시작 국면을 정한다.
    caption: 'count',
  };
}

/**
 * 선언의 값들. 하나라도 성하지 않으면 통째로 버린다 — 걸러 내면 자리 번호가
 * 밀려 `target: index:<i>` 와 어긋난다.
 *
 * 새 배열을 만들어 담는다. 러너가 주는 객체는 mechanism 과 view 가 함께 쓰는
 * 한 벌이라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
 */
function readValues(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const v of raw) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return [];
    out.push(v);
  }
  return out;
}

/** 걸음이 가리키는 한 자리. 식별자 파싱은 `toIndexArray` 를 경유한다 (원칙 4). */
function targetIndex(event: FacetRuntimeEvent): number | null {
  const i = toIndexArray(event.target)[0];
  return typeof i === 'number' && Number.isInteger(i) ? i : null;
}

export const countThenPlaceScene: ScenePlan<CountThenPlaceScene> = {
  /**
   * 첫 장면은 처음 늘어선 값들과 값의 종류 수다.
   *
   * 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 읽는다. 종류 수는
   * 선언이 정하는 것이고 (계수 배치가 성립하는 전제), 없으면 값에서 역산한다 —
   * 옛 stage 의 `readModel` 과 같은 잣대다.
   */
  initial(initialData: unknown): CountThenPlaceScene {
    const raw = (initialData ?? {}) as Record<string, unknown>;
    const values = readValues(raw.values);
    const declared = raw.range;
    const range =
      typeof declared === 'number' && Number.isInteger(declared) && declared > 0
        ? declared
        : values.reduce((m, v) => Math.max(m, v + 1), 0);
    return atStart({ values, range });
  },

  reduce(scene: CountThenPlaceScene, event: FacetRuntimeEvent): CountThenPlaceScene {
    switch (event.type) {
      // 값을 하나 읽어 그 값의 열에 눈금을 쌓는다. 몇 번째로 쌓이는지는 세지
      // 않는다 — `counted` 에 붙는 차례가 곧 그것이다.
      case 'count-tick': {
        const at = targetIndex(event);
        if (at === null || typeof scene.values[at] !== 'number') return scene;
        if (scene.counted.includes(at)) return scene;
        return {
          ...scene,
          counted: [...scene.counted, at],
          cursor: at,
          step: { kind: 'count', at, from: scene.cursor ?? at },
          caption: 'count',
        };
      }

      // 앞에서부터 한 열씩 굳는다. **어느 열인지는 발신이 오는 차례가 말한다** —
      // 굳은 열의 수가 곧 지금 굳는 열의 번호다.
      case 'bucket-settle': {
        if (scene.settled >= scene.range) return scene;
        const value = scene.settled;
        return {
          ...scene,
          settled: value + 1,
          step: { kind: 'settle', value },
          caption: 'settle',
        };
      }

      // 왼쪽부터 값을 집어 제 번호로 보낸다. 어느 번호인지는 `reckon` 이 센다 —
      // 그 값의 시작 자리에 이미 앉은 수를 더한 것이다.
      case 'place': {
        const at = targetIndex(event);
        if (at === null || typeof scene.values[at] !== 'number') return scene;
        if (scene.placed.includes(at)) return scene;
        return {
          ...scene,
          placed: [...scene.placed, at],
          cursor: at,
          step: { kind: 'place', at, from: scene.cursor ?? at },
          caption: 'place',
        };
      }

      // 다 놓았다. 커서는 읽을 것이 없으므로 물러난다 — 어디서 물러나는지만
      // 걸음에 남긴다.
      case 'done':
        return {
          ...scene,
          cursor: null,
          step: { kind: 'done', from: scene.cursor },
          caption: 'done',
        };

      // 손으로 짚기 시작 — 쌓인 눈금도 앉은 타일도 전부 거두고 처음 화면으로.
      case 'rewind':
        return atStart({ values: scene.values, range: scene.range });

      default:
        // 이 facet 의 algorithm 은 위 다섯만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
