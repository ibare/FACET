/**
 * associativityRelief 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 무엇으로 정해지나
 *
 * 걸음이 고치는 것은 하나뿐이다 — **판마다의 접근 자취**. 그 자취 하나에서
 * 화면이 통째로 나온다.
 *
 *   어느 칸에 무엇이 앉아 있나   자취를 접으면 나온다 (`seatsAt`)
 *   밀려나는 것이 누구인가       그 칸에 앉아 있던 것 (`seatsAt(…, i)`)
 *   곁에 앉는 것인가             그 자리에 이미 몇이 앉아 있나
 *   미스가 몇인가 · 몇을 밀어냈나 도장을 센다 (`missesOf` · `evictionsOf`)
 *   몇 번째 접근인가             자취의 길이가 곧 그 번호다
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * projector 에는 `let` 이 하나도 없었다 (① 0 건). 숨은 자리는 stage 에 있었다.
 *
 * - **`const residents: Chip[]`** — 어느 칸에 무슨 주소가 앉아 있나가 코드
 *   어디에도 없었다. `label.textContent` 와 `opacity` 에만 있었다. 화면이
 *   통째로 상태였던 자리다. 이제 `seatsAt` 이 자취를 접어 말한다.
 * - **`let curWays`** — 지금 짜임이 무엇인가를 stage 가 따로 적어 두고
 *   `cellCenterX` 가 그것으로 자리를 셈했다. DOM 의 거울이라 되짚어 세운
 *   직후에는 옛 화면의 것이다. 이제 `rounds.length` 가 그것을 말한다.
 * - **`stamps[waysList.indexOf(ways)]`** — 몇 번째 판인가를 **연관도 값을
 *   되찾아** 알아냈다. `ways` 가 되풀이되면(`[1, 2, 1]`) 두 판이 한 줄을
 *   나눠 쓴다. 이제 판의 차례가 곧 줄의 번호다.
 * - **`paintResident(i, tone: 'rest' | 'hit' | 'leave')`** — 칸의 형편이
 *   함수 인자의 인라인 유니온에만 있었다. `type` 선언도 아니라 어떤 훑기에도
 *   안 걸린다. 지금은 형편이 `seatsAt` 에서 나오고 칠은 그 결과다.
 *
 * ── 이 이행이 화면에 보탠 것
 *
 * 옛 화면은 `M M M M M M` 과 `M M H H H H` 두 줄을 남겨 미스 수는 견주게
 * 했지만, **몇을 밀어냈는지**는 어디에도 남지 않았다. 1-way 의 여섯 미스 중
 * 다섯이 앉아 있던 것을 쫓아낸 것이고 2-way 는 한 번도 안 쫓아냈다는 것이
 * "풀렸다" 의 알맹이인데, 밀려나는 장면이 지나가고 나면 자취가 없었다.
 * 이제 `evictionsOf` 가 도장과 **같은 자취**에서 그 수를 센다.
 *
 * `done` 이 싣던 `firstMisses` · `lastMisses` 도 걷어냈다. 화면의 도장과 다른
 * 출처에서 온 수였고, 그것이 이 조각의 결론이었다.
 *
 * 좌표는 담지 않는다. 칸의 **번호**만 담고 자리는 그리는 쪽이 캔버스에서
 * 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지만 담고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { setIndexOf, setsOf } from './algorithm.js';

/** 접근 하나가 어떻게 끝났나. 이 판정은 걸음이 내린다. */
export type ReliefOutcome = 'hit' | 'fill' | 'evict';

/** 접근 하나의 자취. 몇 번째 접근인가는 배열의 차례가 이미 말한다. */
export type ReliefAccess = {
  outcome: ReliefOutcome;
  /**
   * 그 자리 안의 몇 번째 칸인가.
   *
   * 빈 칸 고르기와 LRU 가 정하는데 그것이 이 조각의 알고리즘 그 자체라, 장면이
   * 되풀이하지 않고 걸음이 실어 온 판정을 그대로 쓴다.
   */
  wayIndex: number;
};

/** 한 판. 연관도는 `waysList` 의 차례가 정하므로 담지 않는다. */
export type ReliefRound = { accesses: ReliefAccess[] };

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데만** 쓴다.
 *
 * 계기값을 싣지 않는다 — 날아오는 것의 출발 자리도, 밀려나는 것의 자리도,
 * 앞 짜임의 칸 자리도 전부 자취에서 셈으로 나온다. 그래서 `render` 가 `prev`
 * 를 아예 안 본다 (S-scene).
 */
export type ReliefStep = { kind: 'access' } | { kind: 'regroup' } | { kind: 'done' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지다 (C10). 인자는 장면이 센다. */
export type ReliefCaption = { kind: 'access' } | { kind: 'regroup' } | { kind: 'done' };

export type AssociativityReliefScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  /** 라인 하나가 담는 바이트. 주소를 줄 번호로 바꾸는 나눗수다. */
  lineBytes: number;
  /** 캐시 전체의 칸 수. 짜임이 바뀌어도 이 수는 그대로다 — 조각의 주장이다. */
  totalLines: number;
  /** 견줄 연관도. 판의 차례가 여기서 연관도를 집는다. */
  waysList: number[];
  /** 접근할 주소. 두 판에 같은 열을 쓴다. 접근의 차례가 곧 이 배열의 자리다. */
  addresses: number[];

  // ── 걸음이 고치는 것.
  /** 판마다의 접근 자취. 첫 판은 선언이 이미 열어 두므로 하나로 시작한다. */
  rounds: ReliefRound[];
  /**
   * 두 판을 맞대었나. 마지막 걸음(`done`)이 세운다.
   *
   * 구조로는 못 가른다 — 마지막 판의 마지막 접근이 끝나는 순간 이미 "모든 판이
   * 다 굴렀다" 가 참이 되어, 맞댐 표시가 한 걸음 일찍 선다. 맞대는 것은 그
   * 걸음이 내리는 판정이라 여기 적는다.
   */
  settled: boolean;
  step: ReliefStep | null;
  caption: ReliefCaption | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `rounds` · `settled` · `step` · `caption` 은 들지 않는다 — 걸음이 고치는 것을
 * 바탕으로 넘기면 되감은 화면이 이미 굴러간 자취를 세운다 (프로토콜 4 절).
 * 호출부는 **객체 리터럴**로 넘겨야 초과 속성 검사가 돌아 이 좁히기가 막는다.
 */
type ReliefBase = Pick<
  AssociativityReliefScene,
  'lineBytes' | 'totalLines' | 'waysList' | 'addresses'
>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: ReliefBase): AssociativityReliefScene {
  return {
    lineBytes: base.lineBytes,
    totalLines: base.totalLines,
    waysList: base.waysList,
    addresses: base.addresses,
    rounds: [{ accesses: [] }],
    settled: false,
    step: null,
    caption: null,
  };
}

/** 그 판의 연관도. 판의 차례가 정한다 — 걸음이 실어 오지 않는다. */
export function waysOf(scene: AssociativityReliefScene, roundIndex: number): number {
  const w = scene.waysList[Math.min(roundIndex, scene.waysList.length - 1)];
  return typeof w === 'number' && w >= 1 ? Math.floor(w) : 1;
}

/** 그 판의 자리 수. algorithm 이 내준 잣대를 그대로 부른다. */
export function setsOfRound(scene: AssociativityReliefScene, roundIndex: number): number {
  return setsOf(scene.totalLines, waysOf(scene, roundIndex));
}

/** 자리와 칸 번호로 캐시 전체의 몇 번째 칸인가. */
export function cellOf(setIndex: number, wayIndex: number, ways: number): number {
  return setIndex * ways + wayIndex;
}

/**
 * 그 판에서 접근 `count` 개를 굴린 뒤 각 칸에 앉아 있는 주소.
 *
 * 화면의 칸도, 밀려나는 것이 누구인가도, 곁에 앉는 것인가도 전부 여기서 나온다.
 * `count` 를 줄여 부르면 그 접근 **직전**의 형편이 된다.
 */
export function seatsAt(
  scene: AssociativityReliefScene,
  roundIndex: number,
  count: number,
): (number | null)[] {
  const seats: (number | null)[] = Array.from({ length: scene.totalLines }, () => null);
  const round = scene.rounds[roundIndex];
  if (!round) return seats;
  const ways = waysOf(scene, roundIndex);
  const sets = setsOfRound(scene, roundIndex);
  const upTo = Math.min(count, round.accesses.length, scene.addresses.length);
  for (let i = 0; i < upTo; i += 1) {
    const access = round.accesses[i]!;
    const addr = scene.addresses[i]!;
    const cell = cellOf(setIndexOf(addr, scene.lineBytes, sets), access.wayIndex, ways);
    if (cell >= 0 && cell < seats.length) seats[cell] = addr;
  }
  return seats;
}

/** 그 판의 미스 수. 화면의 도장과 같은 자취를 센다. */
export function missesOf(round: ReliefRound): number {
  let n = 0;
  for (const access of round.accesses) {
    if (access.outcome !== 'hit') n += 1;
  }
  return n;
}

/**
 * 그 판이 앉아 있던 것을 몇 번 밀어냈나.
 *
 * "풀렸다" 가 수로 서는 자리다 — 1-way 의 여섯 미스 중 다섯이 쫓아낸 것이고
 * 2-way 는 0 이다. 도장과 같은 자취에서 센다.
 */
export function evictionsOf(round: ReliefRound): number {
  let n = 0;
  for (const access of round.accesses) {
    if (access.outcome === 'evict') n += 1;
  }
  return n;
}

/** 그 판이 접근열을 끝까지 굴렸나. 다 굴린 줄에만 셈이 선다. */
export function roundComplete(scene: AssociativityReliefScene, roundIndex: number): boolean {
  const round = scene.rounds[roundIndex];
  return round !== undefined && round.accesses.length >= scene.addresses.length;
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** 넘겨받은 배열을 **참조로 쥐지 않는다** — algorithm 이 제자리에서 고친다 (S-scene). */
function nums(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) return fallback;
  const out: number[] = [];
  for (const item of value) {
    if (typeof item === 'number' && Number.isFinite(item)) out.push(item);
  }
  return out.length > 0 ? out : fallback;
}

function wayIndexOf(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = (payload as Record<string, unknown>).wayIndex;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const i = Math.trunc(value);
  return i >= 0 ? i : null;
}

/** 접근 하나를 지금 판의 자취에 얹는다. 앞 장면을 제자리에서 고치지 않는다. */
function pushAccess(
  scene: AssociativityReliefScene,
  outcome: ReliefOutcome,
  payload: unknown,
): AssociativityReliefScene {
  const wayIndex = wayIndexOf(payload);
  if (wayIndex === null) return scene;
  const last = scene.rounds.length - 1;
  const round = scene.rounds[last];
  if (!round || round.accesses.length >= scene.addresses.length) return scene;
  const rounds = scene.rounds.slice();
  rounds[last] = { accesses: [...round.accesses, { outcome, wayIndex }] };
  return { ...scene, rounds, step: { kind: 'access' }, caption: { kind: 'access' } };
}

export const associativityReliefScene: ScenePlan<AssociativityReliefScene> = {
  /**
   * 첫 장면은 빈 캐시와 첫 짜임이다.
   *
   * 넘겨받은 선언을 참조로 쥐지 않는다 — 러너가 주는 것은 mechanism 과 view 가
   * 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다
   * (S-scene). 수는 값으로, 배열은 새로 지어 베껴 온다.
   */
  initial(initialData: unknown): AssociativityReliefScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    return atStart({
      lineBytes: Math.max(1, num(d.lineBytes, 16)),
      totalLines: Math.max(1, num(d.totalLines, 4)),
      waysList: nums(d.ways, [1]).map((w) => Math.max(1, Math.floor(w))),
      addresses: nums(d.accesses, []),
    });
  },

  reduce(
    scene: AssociativityReliefScene,
    event: FacetRuntimeEvent,
  ): AssociativityReliefScene {
    switch (event.type) {
      // 칸은 그대로 두고 묶음만 다시 긋는다. 판이 하나 늘 뿐이고 앞 판의 자취는
      // 그대로 남는다 — 남지 않으면 견줄 짝이 사라져 조각이 "이 짜임에서는 잘
      // 된다" 만 말하게 된다.
      case 'regroup': {
        if (scene.rounds.length >= scene.waysList.length) return scene;
        return {
          ...scene,
          rounds: [...scene.rounds, { accesses: [] }],
          step: { kind: 'regroup' },
          caption: { kind: 'regroup' },
        };
      }

      case 'cache-hit':
        return pushAccess(scene, 'hit', event.payload);

      case 'cache-fill':
        return pushAccess(scene, 'fill', event.payload);

      case 'cache-evict':
        return pushAccess(scene, 'evict', event.payload);

      case 'done':
        return { ...scene, settled: true, step: { kind: 'done' }, caption: { kind: 'done' } };

      case 'rewind':
        return atStart({
          lineBytes: scene.lineBytes,
          totalLines: scene.totalLines,
          waysList: scene.waysList,
          addresses: scene.addresses,
        });

      default:
        // 위 여섯이 이 algorithm 이 내는 전부다. 그 밖의 것은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
