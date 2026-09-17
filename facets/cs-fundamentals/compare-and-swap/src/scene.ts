/**
 * compareAndSwap 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 짝마다 **자리** 둘이 고정돼 있고 그 위에 **값** 둘이 얹혀 있다. 견주면 두 값이
 * 자리에서 살짝 들리고 판정 표식(`5 > 3`)이 뜬다. 판정이 참일 때만 두 값이 호를
 * 타고 엇갈려 서로의 자리로 건너간다. 거짓이면 들렸던 값이 도로 내려앉는다.
 *
 * 그러니 화면을 다시 그리는 데 필요한 것은 **어느 짝까지 결말이 났는가**, 그리고
 * **지금 다루는 짝이 어느 형편인가** 둘뿐이다. 나머지 — 어느 자리에 어느 값이
 * 앉았나, 판정이 무엇이었나, 호의 자취가 남았나 — 는 처음 배치에서 파생된다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * 옮기기 전 projector 에는 `let` 이 하나도 없었다. 상태는 전부 stage 에 있었고
 * 넷은 `let` 도 `Set.has` 도 아닌 자리에 있었다.
 *
 * - **`Token.seat`** — 그 값이 지금 **어느 칸에 앉았나**. `type Token = { group,
 *   tile, label, seat }` 로 DOM 손잡이와 한 객체에 묶여 있었고, `cross()` 가
 *   `a.seat = b.seat` 로 제자리에서 고쳤다. 역이 없다. 이제 장면의 `resolved` 와
 *   처음 배치에서 `seatsOf` 가 셈한다.
 * - **`g.traces` 의 호 두 줄** — 맞바꿈이 일어났다는 자취. `cross()` 가 붙이기만
 *   하고 지우는 명령이 없어 DOM 에 쌓이고 있었다. **그 누적이 이 조각의 결론이다**
 *   (셋 중 하나만 무언가를 옮겼다). 정적으로 그리지 않으면 되짚었을 때 사라진다.
 * - **`g.glyph` 의 `textContent` 와 `opacity`** — 판정 표식. 역시 쌓이기만 했다.
 * - **`source`** — 되감기의 바탕. `init`/`reset` 명령으로만 오갔다.
 *
 * ── 채움과 테두리를 가른다
 *
 * **채움은 값의 형편**(들려 있다 / 건너가는 중이다 / 앉아 있다), **테두리는 견줌의
 * 표식**(이 짝은 견주어졌다)이다. 값이 실제로 자리를 옮기는 조각이라 이 둘을
 * 섞으면 맞바꾼 뒤 읽기가 뒤집힌다 — 고른 쪽을 채움으로 칠해 두면 그 자리에 진
 * 값이 앉는다. 그래서 남는 표식은 값이 아니라 **자리**에 붙인다 (S-scene).
 *
 * 좌표는 담지 않는다. 짝의 수가 자리를 정하므로 그리는 쪽이 캔버스에서 역산한다
 * (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만 담고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 *
 * ── 판정은 `orderOf` 한 함수만 안다
 *
 * 견줌의 답은 바탕 자료에 순수 함수를 먹이면 나온다. algorithm 이 세어 실어
 * 보내는 대신 **함수를 내주고 장면이 부른다** — 그래야 "두 자리에서 세기" 가
 * 들어올 문이 닫힌다. scene 이 algorithm 을 import 하는 것은 원칙 1 의 허용
 * 방향이다 (장면이 projector 자리를 잇는다).
 */

import { toIndexArray, type FacetRuntimeEvent, type ScenePlan } from '@ffacet/core/runtime';

import { orderOf, type PairOrder } from './algorithm.js';

/** 짝 하나의 처음 배치. `[왼쪽 자리의 값, 오른쪽 자리의 값]`. */
export type CompareAndSwapPair = readonly [number, number];

/**
 * 지금 다루고 있는 짝과 그 형편. **지나가는 것**이라 다음 짝으로 넘어가면 없어진다.
 *
 * - `weighing` — 두 값이 들려 견주어지는 중. 아직 아무것도 옮기지 않았다.
 * - `crossed` — 판정이 참이라 방금 서로의 자리로 건너왔다.
 * - `held` — 판정이 거짓이라 제 자리로 도로 내려앉았다.
 */
export type CompareAndSwapFocus = {
  readonly pair: number;
  readonly state: 'weighing' | 'crossed' | 'held';
};

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데** 쓴다.
 *
 * 운동의 출발 그림은 `prev` 에서 꺼내지 않는다 (S-scene). 이 조각은 출발 자리를
 * 전부 처음 배치에서 되셈할 수 있어 계기값을 따로 실을 것이 없다 — 건너가기 전의
 * 자리가 곧 `origin` 의 자리다.
 */
export type CompareAndSwapStep =
  | { kind: 'weigh'; pair: number }
  | { kind: 'cross'; pair: number }
  | { kind: 'settle'; pair: number }
  | { kind: 'tally' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type CompareAndSwapCaption =
  | { kind: 'compare'; left: number; right: number }
  | { kind: 'swap' }
  | { kind: 'holdOrdered' }
  | { kind: 'holdEqual' }
  | { kind: 'summary'; compares: number; swaps: number };

export type CompareAndSwapScene = {
  /**
   * 처음 배치. `rewind` 가 여기로 돌아오고, 짝의 수가 기하를 정한다.
   *
   * 모든 장면이 같은 배열을 나눠 쥐지만 **누구도 고치지 않는다** — 고치면 과거가
   * 함께 바뀐다 (S-scene 의 Exception).
   */
  readonly origin: readonly CompareAndSwapPair[];
  /** 결말까지 난 짝의 수. 앞의 이만큼이 판정을 받고 제자리를 찾았다. */
  readonly resolved: number;
  /** 지금 다루고 있는 짝. 없으면 `null`. */
  readonly focus: CompareAndSwapFocus | null;
  readonly step: CompareAndSwapStep | null;
  readonly caption: CompareAndSwapCaption | null;
};

/**
 * 걸음이 **바꾸지 않는** 부분. 첫 장면이 한 번 정한다.
 *
 * `resolved` 와 `focus` 를 여기 넣지 않는다. 그것들은 걸어온 자취라, 바탕으로 묶어
 * 되감기에 넘기면 되감은 화면이 이미 다 건너간 채로 서고 그 위에 algorithm 이
 * 처음부터 다시 밟는다. 타입으로 좁혀 두어 구조적으로 못 넘어가게 한다 — 다만
 * 호출부가 **객체 리터럴**이어야 초과 속성 검사가 돈다.
 */
type CompareAndSwapBase = Pick<CompareAndSwapScene, 'origin'>;

/** 선언에서 온 값이라 형태를 믿지 않고 좁힌다 (C9). */
function readPairs(raw: unknown): CompareAndSwapPair[] {
  if (!Array.isArray(raw)) return [];
  const out: CompareAndSwapPair[] = [];
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [a, b] = entry;
    if (typeof a !== 'number' || !Number.isFinite(a)) continue;
    if (typeof b !== 'number' || !Number.isFinite(b)) continue;
    out.push([a, b]);
  }
  return out;
}

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: CompareAndSwapBase): CompareAndSwapScene {
  return {
    origin: base.origin,
    resolved: 0,
    focus: null,
    step: null,
    caption: null,
  };
}

/**
 * 그 짝의 판정. 아직 견주지 않았어도 답은 정해져 있다 — 바탕에서 나오는 값이라
 * 걸음이 실어 오지 않고 여기서 셈한다.
 */
export function orderAt(scene: CompareAndSwapScene, pair: number): PairOrder | null {
  const seats = scene.origin[pair];
  return seats === undefined ? null : orderOf(seats[0], seats[1]);
}

/** 그 짝이 이미 견주어졌나. 판정 표식과 자리의 표식이 이것으로 갈린다. */
export function isJudged(scene: CompareAndSwapScene, pair: number): boolean {
  return pair < scene.resolved || scene.focus?.pair === pair;
}

/** 그 짝에서 맞바꿈이 일어났나. 호의 자취가 이것으로 갈린다. */
export function hasCrossed(scene: CompareAndSwapScene, pair: number): boolean {
  return pair < scene.resolved && orderAt(scene, pair) === 'greater';
}

/**
 * 지금 그 짝의 두 자리에 앉아 있는 값. `[왼쪽 자리, 오른쪽 자리]`.
 *
 * 앞서 이 값은 `Token.seat` 에만 있었고 `cross()` 가 제자리에서 고쳤다. 이제
 * 처음 배치와 `resolved` 에서 셈한다 — 되짚기가 앞으로 가기와 같은 길이 된다.
 */
export function seatsOf(scene: CompareAndSwapScene, pair: number): CompareAndSwapPair {
  const seats = scene.origin[pair] ?? ([0, 0] as const);
  return hasCrossed(scene, pair) ? [seats[1], seats[0]] : seats;
}

/** 지금까지 무언가를 옮긴 짝의 수. 구조에서 세지는 것이라 장면이 센다. */
function swapsIn(scene: CompareAndSwapScene): number {
  let count = 0;
  for (let i = 0; i < scene.resolved; i += 1) if (hasCrossed(scene, i)) count += 1;
  return count;
}

/** `index:<i>` 에서 짝 번호를 얻는다. 식별자 파싱은 `toIndexArray` 를 경유한다 (원칙 4). */
function pairIndex(event: FacetRuntimeEvent): number | null {
  const [index] = toIndexArray(event.target);
  return typeof index === 'number' ? index : null;
}

export const compareAndSwapScene: ScenePlan<CompareAndSwapScene> = {
  /**
   * 첫 장면은 짝들이 처음 배치 그대로 앉아 있는 화면이다.
   *
   * 이 조각은 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 읽는다. 다만
   * **참조로 쥐지 않는다** — 러너가 주는 객체는 mechanism 과 view 가 함께 쓰는 한
   * 벌이라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다 (S-scene).
   * 정렬 조각은 이 함정에 특히 가깝다. `readPairs` 가 짝마다 새 배열을 만든다.
   */
  initial(initialData: unknown): CompareAndSwapScene {
    const raw = (initialData ?? {}) as { pairs?: unknown };
    return atStart({ origin: readPairs(raw.pairs) });
  },

  reduce(scene: CompareAndSwapScene, event: FacetRuntimeEvent): CompareAndSwapScene {
    switch (event.type) {
      // 두 값을 견준다. 자리에서 들리기만 하고 아무것도 옮기지 않는다.
      case 'compare': {
        const pair = pairIndex(event);
        if (pair === null) return scene;
        const seats = scene.origin[pair];
        if (seats === undefined) return scene;
        return {
          ...scene,
          focus: { pair, state: 'weighing' },
          step: { kind: 'weigh', pair },
          caption: { kind: 'compare', left: seats[0], right: seats[1] },
        };
      }

      // 판정이 참이라 두 값이 서로의 자리로 건너간다. 그 짝의 결말이 난다.
      case 'swap': {
        const pair = pairIndex(event);
        if (pair === null || scene.origin[pair] === undefined) return scene;
        return {
          ...scene,
          resolved: pair + 1,
          focus: { pair, state: 'crossed' },
          step: { kind: 'cross', pair },
          caption: { kind: 'swap' },
        };
      }

      // 판정이 거짓이라 들렸던 값이 제 자리로 도로 내려앉는다.
      case 'hold': {
        const pair = pairIndex(event);
        if (pair === null || scene.origin[pair] === undefined) return scene;
        // 왜 옮기지 않았는지는 판정이 말한다. 걸음이 따로 실어 오지 않는다.
        const equal = orderAt(scene, pair) === 'equal';
        return {
          ...scene,
          resolved: pair + 1,
          focus: { pair, state: 'held' },
          step: { kind: 'settle', pair },
          caption: equal ? { kind: 'holdEqual' } : { kind: 'holdOrdered' },
        };
      }

      // 다 끝났다. 견줌의 수와 옮김의 수는 화면에 선 것을 그대로 센 값이다.
      case 'done':
        return {
          ...scene,
          focus: null,
          step: { kind: 'tally' },
          caption: { kind: 'summary', compares: scene.resolved, swaps: swapsIn(scene) },
        };

      case 'rewind':
        return atStart({ origin: scene.origin });

      default:
        // 이 facet 의 algorithm 은 위 다섯만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
