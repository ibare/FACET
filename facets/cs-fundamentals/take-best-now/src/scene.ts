/**
 * takeBestNow 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 주장이 무엇인가
 *
 * **집은 것들이 쌓인다.** 무엇을 어느 차례로 집었고 그래서 어디까지 닿았는지가
 * 다 끝난 화면에 통째로 남아야 한다. 그러니 장면의 정본은 `taken` 하나다 —
 * 집은 진열대 자리를 **집은 차례대로** 담은 배열이고, 줄어드는 길이 없다
 * (이 알고리즘에는 무르는 걸음이 없다).
 *
 * 남은 몫도 닿은 거리도 전부 거기서 파생한다. 걸음이 실어 오는 수를 그대로
 * 받지 않는다 — 받으면 화면의 구조와 화면에 뜨는 수가 다른 출처가 된다.
 *
 * ── 숨은 상태는 어디에 있었나
 *
 * 옮기기 전 projector 에는 `let` 이 하나도 없었고, stage 의 `let` 은 둘뿐이었다.
 * 나머지는 전부 DOM 과 `const` 안에 있었다.
 *
 * - **집은 것들** — `const settled: CoinParts[]`. `const` 로 묶였는데
 *   `settled.push(...)` · `settled.length = 0` 으로 제자리에서 고쳐졌다.
 *   이 조각의 주장 그 자체가 거기 있었다. 이제 `taken` 이다.
 * - **어느 차례에 앉았나** — 앉은 동전 `g` 의 `transform` 에만 있었고, 그 값은
 *   걸음이 실어 온 `slot` 에서 왔다. 이제 `taken` 의 배열 자리가 곧 차례다.
 * - **남은 몫** — `let remaining` 과 `meterText.textContent`. 걸음이 실어 온
 *   `remaining` 을 그대로 받아 적던 자리다. 이제 `target − reachedBy(taken)`.
 * - **닿은 거리** — **코드 어디에도 없었다.** 계량기가 남은 몫만 보였으므로
 *   "그때까지 얼마나 닿았나" 는 화면에도 변수에도 남지 않았다. 이제
 *   `reachedBy` 가 셈하고 쟁반의 눈금이 걸음마다 그것을 남긴다.
 * - **어느 자리에 손이 닿나** — 진열대 동전 `disc` 의 `fill` 과
 *   `stroke-dasharray` 에만 있었다. 걸음이 실어 온 `reachable` 을 받아
 *   칠하기만 했다. 이제 `reachable` 이고, 그 술어는 algorithm 이 내주는
 *   `reachableIndices` 한 자리에서만 산다.
 * - **`type CoinState`** — 선언만 있고 저장되는 곳이 없었다. 칠에만 쓰였고
 *   "지금 어느 동전이 무슨 형편인가" 는 `fill` 속성에만 있었다. 이제
 *   `taken` · `reachable` · `step` 이 말한다.
 *
 * ── 채움과 테두리를 가른다
 *
 * **채움은 값의 형편**(남은 몫에 아직 들어가나), **테두리는 고름의 표식**
 * (이번에 집었나 · 전에 집은 적 있나) 이다. 값이 자리를 옮기는 조각이라 고른
 * 쪽을 채움으로 칠하면 옮긴 뒤의 읽기가 뒤집힌다. 갈라 두면 부딪히지 않는다.
 *
 * 좌표는 담지 않는다. 자리 수가 폭을 정하므로 그리는 쪽이 캔버스에서 역산한다
 * (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만 담고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import { parseTarget, type FacetRuntimeEvent, type ScenePlan } from '@ffacet/core/runtime';

import { reachableIndices } from './algorithm.js';

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type TakeBestNowCaption =
  /** 만들 금액을 세운다. */
  | { kind: 'goal'; target: number }
  /** 집는 까닭. `before` 는 집기 **직전**의 몫이라 몫이 줄어든 뒤에도 참이다. */
  | { kind: 'take'; coin: number; before: number }
  | { kind: 'done'; count: number; target: number };

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데** 쓰고, 운동의 **출발 그림**도
 * 여기서 셈한다 — `prev` 에서 꺼내지 않는다 (S-scene).
 */
export type TakeBestNowStep =
  /** 목표를 세우기만 하는 얇은 걸음. 계량기가 한 번 부풀었다 돌아온다. */
  | { kind: 'goal' }
  /**
   * 진열대 `at` 자리의 동전이 쟁반으로 내려온다.
   *
   * `before` 는 내려오기 직전의 몫이다. 정적 그리기는 이미 줄어든 몫을 세우므로,
   * 떨어지는 동안 계량기가 무엇을 보이고 있어야 하는지를 여기서 말한다.
   */
  | { kind: 'take'; at: number; before: number }
  /** 쌓인 것들을 하나씩 세어 본다 — 마지막 걸음의 말과 같은 동사다. */
  | { kind: 'tally' };

export type TakeBestNowScene = {
  /**
   * 진열대에 놓인 액면. 배열 자리가 곧 진열 자리다.
   *
   * 모든 장면이 같은 배열을 나눠 쥐지만 **누구도 고치지 않는다** — 고치면 과거가
   * 함께 바뀐다 (S-scene 의 Exception).
   */
  readonly coins: readonly number[];
  /** 만들어야 할 금액. 걸음이 고치지 않는 바탕이다. */
  readonly target: number;
  /**
   * 집은 진열대 자리를 **집은 차례대로**. 이 조각의 주장 본체다.
   *
   * 길이가 곧 집은 횟수이고, 배열 자리가 곧 쟁반의 자리 번호다. 같은 액면을
   * 두 번 집으면 같은 수가 두 번 들어온다 — 진열대는 줄지 않는다.
   */
  readonly taken: readonly number[];
  /** 남은 몫. `target − reachedBy(coins, taken)` 이다 — 걸음이 싣지 않는다. */
  readonly remaining: number;
  /**
   * 남은 몫에 손이 닿는 자리.
   *
   * 술어는 algorithm 의 `reachableIndices` 한 자리에서만 산다. 여기서 다시
   * 적으면 "들어간다" 의 잣대가 두 군데가 되어 언젠가 갈린다.
   */
  readonly reachable: readonly number[];
  readonly step: TakeBestNowStep | null;
  readonly caption: TakeBestNowCaption | null;
};

/**
 * 걸음이 **바꾸지 않는** 부분. 첫 장면과 되감기가 함께 쓴다.
 *
 * `taken` 을 여기 넣지 않는다. 그것은 걸어온 자취라, 바탕으로 묶어 되감기에
 * 넘기면 되감은 화면이 쟁반을 채운 채로 서고 그 위에 algorithm 이 처음부터 다시
 * 집는다. 타입으로 좁혀 구조적으로 못 넘어가게 하고, 부르는 쪽은 **객체 리터럴**
 * 로 넘긴다 — 변수로 넘기면 초과 속성 검사가 돌지 않아 좁힌 타입이 아무것도
 * 막지 못한다.
 */
type TakeBestNowBase = Pick<TakeBestNowScene, 'coins' | 'target'>;

/**
 * 집은 것들이 닿은 거리.
 *
 * 계량기의 남은 몫도, 쟁반 눈금의 누계도, 다 만들었나 하는 판정도 전부 이 함수
 * 하나를 지난다. 화면에 나란히 뜨는 수가 여러 출처에서 오면 언젠가 갈린다.
 */
export function reachedBy(coins: readonly number[], taken: readonly number[]): number {
  let sum = 0;
  for (const i of taken) {
    const c = coins[i];
    if (typeof c === 'number') sum += c;
  }
  return sum;
}

/** 바탕만 남기고 걸어온 자취를 거둔 장면. */
function atStart(base: TakeBestNowBase): TakeBestNowScene {
  return {
    coins: base.coins,
    target: base.target,
    taken: [],
    remaining: base.target,
    reachable: reachableIndices(base.coins, base.target),
    step: null,
    caption: null,
  };
}

/** `coin:<자리>` 하나를 자리 번호로 되돌린다. 식별자 파싱은 `parseTarget` 경유 (원칙 4). */
function coinIndex(target: FacetRuntimeEvent['target']): number | null {
  const raw = Array.isArray(target) ? target[0] : target;
  if (typeof raw !== 'string') return null;
  const parsed = parseTarget(raw);
  if (parsed === null || parsed.prefix !== 'coin') return null;
  const n = Number(parsed.id);
  return Number.isInteger(n) ? n : null;
}

export const takeBestNowScene: ScenePlan<TakeBestNowScene> = {
  /**
   * 첫 장면은 아직 아무것도 집지 않은 진열대다.
   *
   * 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 읽는다. 다만 **참조로
   * 쥐지 않는다** — 러너가 주는 객체는 mechanism 과 view 가 함께 쓰는 한 벌이라,
   * 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다 (S-scene).
   * 아래 `filter` 가 새 배열을 만든다.
   */
  initial(initialData: unknown): TakeBestNowScene {
    const raw = (initialData ?? {}) as Record<string, unknown>;
    const coins = Array.isArray(raw.coins)
      ? raw.coins.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      : [];
    const target =
      typeof raw.target === 'number' && Number.isFinite(raw.target) ? raw.target : 0;
    return atStart({ coins, target });
  },

  reduce(scene: TakeBestNowScene, event: FacetRuntimeEvent): TakeBestNowScene {
    switch (event.type) {
      // 만들 금액을 세운다. 금액은 바탕에 이미 있으므로 걸음이 싣지 않는다 —
      // 이 걸음이 말하는 것은 수가 아니라 "이제 여기를 겨눈다" 는 것뿐이다.
      case 'goal-set':
        return {
          ...scene,
          step: { kind: 'goal' },
          caption: { kind: 'goal', target: scene.target },
        };

      // 진열대의 한 자리가 쟁반으로 내려온다. 자리 번호는 `coin:<자리>` 가 이미
      // 말하고, 액면도 차례도 남은 몫도 전부 여기서 파생한다.
      case 'coin-taken': {
        const at = coinIndex(event.target);
        if (at === null) return scene;
        const coin = scene.coins[at];
        if (typeof coin !== 'number') return scene;
        const taken = [...scene.taken, at];
        const before = scene.remaining;
        const remaining = scene.target - reachedBy(scene.coins, taken);
        return {
          ...scene,
          taken,
          remaining,
          reachable: reachableIndices(scene.coins, remaining),
          step: { kind: 'take', at, before },
          caption: { kind: 'take', coin, before },
        };
      }

      /*
       * 남은 몫이 갱신되는 걸음.
       *
       * 장면은 여기서 아무것도 옮기지 않는다 — 남은 몫도 손이 닿는 자리도 이미
       * `coin-taken` 이 집은 것들에서 셈해 두었다. 걸음이 실어 오는 수를 여기서
       * 받으면 화면의 구조와 화면에 뜨는 수가 다른 출처가 된다.
       *
       * 그래서 algorithm 쪽에서 `silent` 로 보낸다 — 집으면 닿는 거리가 따라
       * 자라므로 둘은 한 걸음이고, 조용히 보내면 띠에 0ms 짜리 눈금이 서지 않는다.
       */
      case 'reach-updated':
        return scene;

      // 다 만들었다. 몇 닢이었나는 쌓인 것을 세면 나온다.
      case 'done':
        return {
          ...scene,
          step: { kind: 'tally' },
          caption: { kind: 'done', count: scene.taken.length, target: scene.target },
        };

      case 'rewind':
        return atStart({ coins: scene.coins, target: scene.target });

      default:
        // 이 facet 의 algorithm 은 위 다섯만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
