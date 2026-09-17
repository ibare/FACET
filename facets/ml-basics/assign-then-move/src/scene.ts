/**
 * AssignThenMove 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 는 `let` 이 한 자리도 없었고 조회로 갈리는 분기도 없었다. **상태는 전부
 * stage 에 있었고, 그 가운데 셋이 DOM 의 거울이었다** (프로토콜 3-1 의 ② 와 함정 28).
 *
 * - `let centers` — **중심의 지금 자리를 픽셀로 적어 둔 거울.** 옮기는 운동이
 *   `const from = centers.map(...)` 로 여기서 출발값을 꺼내고, 붙는 운동은 여기서
 *   도착점을 꺼냈다. `getAttribute` 를 안 쓰니 ④ 의 grep 을 지나가지만 병은 같다 —
 *   되짚어 세운 직후에는 그 거울이 옛 화면의 것이라 중심이 엉뚱한 자리에서 출발한다.
 *   지금은 `paths` 가 회마다의 자리를 쥐고 있어 `centersAt` 이 한 칸을 물려 셈한다.
 * - `let tips` — **살 끝의 지금 자리를 적어 둔 거울.** 위와 같은 자리다. 지금은
 *   "붙은 중심의 자리" 라는 파생값이라 `assigns` 와 `paths` 만 있으면 나온다.
 * - `let held` — 점이 어느 중심에 붙었나. `scene.points.map(() => -1)` 로 시작해
 *   걸음이 고쳤고, 옮기는 운동이 살을 끌 때 이것을 읽었다. 지금은 `assigns` 의
 *   마지막 칸이다.
 * - `let longest` — 막대의 척도. `Math.max(longest, ...step.moved)` 로 걸음마다
 *   불어나 화면 전체의 막대 길이를 정했다. 되감을 때 손으로 `0` 으로 되돌려야 했다.
 *   지금은 자취에 적힌 거리들의 최댓값이라 장면이 센다.
 * - `let stamp` — 도장이 이미 꽂혔나. `finish` 의 분기(`stamp !== null`)가 오직
 *   여기 있었다. 지금은 `finished` 와 자취가 말한다.
 * - `type Scene = { points; seeds }` — **이름이 장면과 부딪혔다** (함정 21). 그것은
 *   장면이 아니라 stage 가 `initialData` 를 좁혀 쥔 밑감이었고, 좁히는 자리가 여기
 *   `initial` 로 옮겨 오면서 `readScene` 과 함께 통째로 없어졌다. 좁히는 규칙이 두
 *   벌이 되지 않게 stage 는 이제 `params.initialData` 를 읽지 않는다.
 * - `type LedgerRow = { group, bars, moved }` — **DOM 손잡이와 수치가 한 객체다**
 *   (⑤). `const rows: LedgerRow[]` 라 `let` grep 을 통과하는데 `push` 와
 *   `rows.length = 0` 으로 알맹이가 제자리에서 고쳐졌고, `row.moved` 가 막대를 다시
 *   칠할 때마다 읽히는 **유일한 거리 보관처**였다.
 * - `knob.getAttribute('x')` · `('opacity')` 세 자리 — 손잡이가 건너갈 **출발값을
 *   화면에서 되읽었다** (④). 게다가 `paintByKnob()` 이 제가 옮겨 둔 손잡이를 도로
 *   읽어 어느 이름을 짙게 할지 정했다 — **같은 물음에 답이 둘**이고, 되짚어 세운
 *   직후에는 그 답이 옛 화면의 것이다 (함정 25). 지금은 국면이 손잡이의 자리를
 *   정하고, 건너가는 도중의 이름은 보간값에서 곧바로 나온다.
 *
 * ── 무엇을 싣고 무엇을 세는가 (프로토콜 4 절의 갈래)
 *
 * **중심을 옮기는 셈(무리의 평균)은 이 조각의 알고리즘 그 자체라 내주지 않는다.**
 * 장면이 평균을 다시 풀면 조각이 보이려는 셈을 장면이 하게 되고 발신이 장식이 된다.
 * 그래서 걸음이 싣는 것은 **판정 둘**뿐이다.
 *
 * - `points-attach` 의 `assign` — 어느 점이 어느 중심에 붙었나. 가장 가까운 중심을
 *   가리는 것이 거리 셈이라 걸음의 판정이다.
 * - `centroids-move` 의 `to` — 중심이 옮겨 갈 자리. 무리의 평균이므로 위와 같다.
 *
 * 나머지는 전부 걷어냈다.
 *
 * - `round` — 회는 올 때마다 하나씩 쌓이므로 `assigns.length` 가 그 번호다.
 * - `counts` — `assign` 을 세면 나온다. algorithm 의 주석도 "둘은 같은 사실의 두
 *   쓰임" 이라 적고 있었다. 두 자리에서 세던 것이다.
 * - `moved` — 옮긴 거리는 **자취의 이웃한 두 칸 사이**라 좌표에서 곧바로 나온다.
 * - `rounds` · `settled` — 회의 수는 `paths.length` 이고, 멎었는지는 마지막 회의
 *   거리를 `ASSIGN_SETTLE_EPS` 로 재면 나온다. **잣대는 algorithm 이 내주어 한
 *   군데로 모은다** — 두 군데에 적으면 갈린다.
 *
 * 그래서 장부의 막대와 캡션의 수와 "멎었다" 는 결론이 **한 자취를 지난다.**
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다 — 점의 화면 자리도 중심의 화면 자리도 캔버스에서 역산하는
 * 값이라 그리는 쪽의 몫이다 (S-piece). 담는 것은 **값의 자리**다. 문안도 담지
 * 않는다 — `phaseOf` 가 무엇을 말할지와 그 인자만 내고 문자는 그리는 쪽이
 * `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { ASSIGN_SETTLE_EPS } from './algorithm.js';

/**
 * 멎었다고 보는 잣대. `algorithm.ts` 가 쥔 것을 그대로 내보낸다 — 그리는 쪽이
 * 따로 적으면 잣대가 두 군데가 된다.
 */
export { ASSIGN_SETTLE_EPS } from './algorithm.js';

/** 자리 하나. 화면 좌표가 아니라 데이터 좌표다. */
export type ScenePt = { x: number; y: number };

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 하나도 싣지 않는다 — 살이 어디서 뻗어 오는지도, 중심이 어느 자리에서
 * 출발하는지도, 손잡이가 어느 쪽에서 건너오는지도 전부 자취 한 칸을 물려 셈하므로
 * `prev` 를 들출 일이 없다 (S-scene).
 */
export type AssignThenMoveStep =
  /** 점이 가장 가까운 중심으로 살을 뻗어 붙잡는다. */
  | { kind: 'attach' }
  /** 중심이 저를 붙잡은 것들의 가운데로 미끄러진다. */
  | { kind: 'move' }
  /** 아무도 안 움직여 멎는다. 장부에 도장이 앉는다. */
  | { kind: 'finish' };

/** 지금 화면이 서 있는 국면. 걸음이 아니라 **자취**에서 나온다. */
export type AssignThenMovePhase =
  /** 아직 아무것도 안 붙었다. 중심 셋이 엉뚱한 자리에 몰려 있다. */
  | { kind: 'start' }
  /** `round` 회의 붙는 몸짓. 중심은 아직 안 옮겼다. */
  | { kind: 'attach'; round: number }
  /** `round` 회의 옮기는 몸짓. */
  | { kind: 'move'; round: number }
  /** 마쳤다. `settled` 면 아무도 안 움직여서 멎은 것이다. */
  | { kind: 'done'; rounds: number; settled: boolean };

export type AssignThenMoveScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 흩어진 점들. 차례가 곧 `assign` 의 자리다. */
  points: readonly ScenePt[];
  /** 중심의 출발 자리. 난수가 아니라 선언에 적힌 값이다. */
  seeds: readonly ScenePt[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /**
   * 회마다의 붙음. `assigns[r - 1][i]` 는 점 i 가 r 회에 붙은 중심의 번호다.
   *
   * 길이가 곧 몇 회째 붙었나이고, 마지막 칸이 지금 살이 걸린 자리다. 앞 칸은
   * 그리지 않지만 **이번 회에 손이 바뀐 점**이 이웃한 두 칸의 차이에서 나온다.
   */
  assigns: readonly (readonly number[])[];
  /**
   * 회마다 중심이 옮겨 간 자리. `paths[r - 1][c]` 는 중심 c 의 r 회 뒤 자리다.
   *
   * **중심이 지나온 길이 여기 그대로 남는다** — 그래서 완주 화면에 처음 자리와
   * 지금 자리를 견줄 짝이 선다. 장부의 막대도 이 배열의 이웃한 두 칸 사이를 잰다.
   */
  paths: readonly (readonly ScenePt[])[];
  /** 마쳤나. 멎었는지 여부는 자취가 말하므로 따로 담지 않는다. */
  finished: boolean;

  step: AssignThenMoveStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `assigns` · `paths` · `finished` 는 걸어온 자취라 여기 넣지 않는다 — 넣으면
 * 되감은 화면이 이미 다 수렴한 중심과 쌓인 장부를 단 채로 서고 그 위에 algorithm
 * 이 처음부터 다시 세우는 것이 겹친다 (S-scene).
 */
type Base = Pick<AssignThenMoveScene, 'points' | 'seeds'>;

/**
 * 되돌린 뒤의 장면 — 점과 중심 셋만 제자리에 서 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 TypeScript 의 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로
 * 통과한다 (S-scene).
 */
function atStart(base: Base): AssignThenMoveScene {
  return {
    points: base.points,
    seeds: base.seeds,
    assigns: [],
    paths: [],
    finished: false,
    step: null,
  };
}

// ── 선언 좁히기 ───────────────────────────────────────────────────────────
//
// 생산자가 같은 패키지라도 경계는 경계다 (C9). 좁히는 자리는 여기 하나이고
// 그리는 쪽은 장면만 받는다 — 두 벌이 되면 점의 수와 중심의 수가 갈린다.

function fields(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 자리 목록. 값만 베껴 새 배열로 돌려준다 — 넘겨받은 것을 참조로 쥐지 않는다. */
function readPoints(raw: unknown): ScenePt[] {
  if (!Array.isArray(raw)) return [];
  const out: ScenePt[] = [];
  for (const item of raw) {
    const p = fields(item);
    const x = num(p?.x);
    const y = num(p?.y);
    if (x !== null && y !== null) out.push({ x, y });
  }
  return out;
}

/** 자리 목록을 `count` 개만 받는다. 수가 어긋나면 null — 그리기가 갈릴 자리다. */
function readPointsOf(raw: unknown, count: number): ScenePt[] | null {
  const out = readPoints(raw);
  return out.length === count ? out : null;
}

/** 중심 번호 목록. 점마다 하나씩, 번호가 중심의 범위 안이어야 한다. */
function readAssign(raw: unknown, points: number, centers: number): number[] | null {
  if (!Array.isArray(raw) || raw.length !== points) return null;
  const out: number[] = [];
  for (const item of raw) {
    const which = num(item);
    if (which === null || !Number.isInteger(which) || which < 0 || which >= centers) return null;
    out.push(which);
  }
  return out;
}

// ── 장면에서 셈해지는 것들 ────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 자취의 선도 장부의 막대도 캡션의 수도
// 같은 함수를 부르므로 갈릴 자리가 없다.

/**
 * `round` 회를 마친 뒤 중심들의 자리. 0 회면 출발 자리다.
 *
 * 운동의 출발 그림이 여기서 나온다 — DOM 도 `prev` 도 들추지 않는다 (S-scene).
 */
export function centersAt(scene: AssignThenMoveScene, round: number): readonly ScenePt[] {
  const at = Math.max(0, Math.min(scene.paths.length, Math.trunc(round)));
  return at === 0 ? scene.seeds : scene.paths[at - 1];
}

/** 지금 중심들이 선 자리. 마지막으로 옮긴 뒤의 자리다. */
export function currentCenters(scene: AssignThenMoveScene): readonly ScenePt[] {
  return centersAt(scene, scene.paths.length);
}

/** 지금 살이 걸린 자리. 아직 아무것도 안 붙었으면 null. */
export function currentAssign(scene: AssignThenMoveScene): readonly number[] | null {
  return scene.assigns[scene.assigns.length - 1] ?? null;
}

/**
 * `round` 회에 중심마다 옮긴 거리.
 *
 * 걸음이 싣지 않는다 — 자취의 이웃한 두 칸 사이라 좌표에서 곧바로 나온다.
 * 장부의 막대와 캡션의 수가 이 한 함수를 지난다.
 */
export function movedAt(scene: AssignThenMoveScene, round: number): number[] {
  if (round < 1 || round > scene.paths.length) return scene.seeds.map(() => 0);
  const before = centersAt(scene, round - 1);
  const after = centersAt(scene, round);
  return after.map((p, i) => {
    const q = before[i];
    return q === undefined ? 0 : Math.hypot(p.x - q.x, p.y - q.y);
  });
}

/** 여태 가장 멀리 옮긴 거리. 막대의 척도라 자취 전체에서 한 번에 센다. */
export function longestMove(scene: AssignThenMoveScene): number {
  let longest = 0;
  for (let round = 1; round <= scene.paths.length; round += 1) {
    for (const distance of movedAt(scene, round)) {
      if (distance > longest) longest = distance;
    }
  }
  return longest;
}

/** `round` 회에 중심마다 붙은 점의 수. `assign` 을 세면 나온다. */
export function countsAt(scene: AssignThenMoveScene, round: number): number[] {
  const counts = scene.seeds.map(() => 0);
  const assign = scene.assigns[round - 1];
  if (assign === undefined) return counts;
  for (const which of assign) {
    if (counts[which] !== undefined) counts[which] += 1;
  }
  return counts;
}

/**
 * `round` 회에 **붙는 자리가 달라진** 점들.
 *
 * 이 조각이 되풀이를 멈추지 않는 까닭이 여기 있다 — 중심이 옮겨 갔으니 가장 가까운
 * 중심이 달라진 점이 생기고, 그래서 또 옮긴다. 아무도 손을 바꾸지 않는 회에는
 * 중심도 움직이지 않고, 그것이 곧 멎는다는 뜻이다. 첫 회는 견줄 앞 회가 없다.
 */
export function switchedAt(scene: AssignThenMoveScene, round: number): number[] {
  const now = scene.assigns[round - 1];
  const before = scene.assigns[round - 2];
  if (now === undefined || before === undefined) return [];
  const out: number[] = [];
  for (let i = 0; i < now.length; i += 1) {
    if (now[i] !== before[i]) out.push(i);
  }
  return out;
}

/**
 * 마지막 회에 아무도 안 움직였나.
 *
 * **결론이 그림과 같은 자취에서 나온다** — 장부의 마지막 줄이 빈 막대를 보이는
 * 것과 이 판정이 같은 수를 쓴다. 잣대는 `algorithm.ts` 가 내준 하나뿐이다.
 */
export function settledNow(scene: AssignThenMoveScene): boolean {
  if (scene.paths.length === 0) return false;
  return movedAt(scene, scene.paths.length).every((d) => d < ASSIGN_SETTLE_EPS);
}

/**
 * 지금 화면이 선 국면.
 *
 * `step` 이 아니라 **자취**에서 낸다 — 같은 걸음을 몇 번 다시 그려도 같은 국면이
 * 나와야 하고, 장면에 국면 필드를 따로 두면 같은 것을 두 자리에 적는 꼴이다.
 * 붙은 회가 옮긴 회보다 하나 많으면 아직 옮기기 전이다.
 */
export function phaseOf(scene: AssignThenMoveScene): AssignThenMovePhase {
  if (scene.finished) {
    return { kind: 'done', rounds: scene.paths.length, settled: settledNow(scene) };
  }
  if (scene.assigns.length === 0) return { kind: 'start' };
  if (scene.assigns.length > scene.paths.length) {
    return { kind: 'attach', round: scene.assigns.length };
  }
  return { kind: 'move', round: scene.paths.length };
}

export const assignThenMoveScene: ScenePlan<AssignThenMoveScene> = {
  /**
   * 첫 장면은 점과 중심의 출발 자리만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. **넘겨받은
   * 것을 참조로 쥐지 않는다** — 점 배열은 러너가 mechanism 과 view 에 함께 주는 한
   * 객체라, 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
   */
  initial(initialData: unknown): AssignThenMoveScene {
    const d = fields(initialData) ?? {};
    return atStart({ points: readPoints(d.points), seeds: readPoints(d.seeds) });
  },

  reduce(scene: AssignThenMoveScene, event: FacetRuntimeEvent): AssignThenMoveScene {
    const p = fields(event.payload);

    switch (event.type) {
      /*
       * 붙는 몸짓. 어느 점이 어느 중심을 잡았나가 거리 셈의 판정이라 실려 온다.
       * 몇 회째인지도 무리 크기도 싣지 않는다 — 회는 올 때마다 하나씩 쌓이고
       * 크기는 이 배열을 세면 나온다.
       */
      case 'points-attach': {
        const assign = readAssign(p?.assign, scene.points.length, scene.seeds.length);
        if (assign === null) return scene;
        // 붙기는 옮기기 뒤에 온다. 짝이 어긋난 발신은 조용히 흘린다 (C2).
        if (scene.assigns.length !== scene.paths.length) return scene;
        return { ...scene, assigns: [...scene.assigns, assign], step: { kind: 'attach' } };
      }

      /*
       * 옮기는 몸짓. 무리의 평균은 이 조각의 알고리즘 그 자체라 장면이 풀지 않고
       * 자리를 받는다. 옮긴 거리는 자취의 두 칸 사이라 받지 않는다.
       */
      case 'centroids-move': {
        const to = readPointsOf(p?.to, scene.seeds.length);
        if (to === null) return scene;
        if (scene.paths.length !== scene.assigns.length - 1) return scene;
        return { ...scene, paths: [...scene.paths, to], step: { kind: 'move' } };
      }

      /* 마침. 돈 횟수도 멎었는지도 자취가 말하므로 실려 오는 것이 없다. */
      case 'done':
        if (scene.finished) return scene;
        return { ...scene, finished: true, step: { kind: 'finish' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ points: scene.points, seeds: scene.seeds });

      default:
        // 이 algorithm 이 발신하는 것은 위 넷이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
