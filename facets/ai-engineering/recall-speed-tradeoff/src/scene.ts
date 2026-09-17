/**
 * RecallSpeedTradeoff 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 는 `let` 도 조회 분기도 없었고, stage 도 DOM 을 되읽지 않았다. 그런데도
 * 화면은 통째로 상태였다 — 넷이 나왔고 셋이 타입 선언과 `Map` 에 있었다.
 *
 * - `let current: SeatView[]` — **지금 다섯 자리에 누가 앉아 있나.** 다음 걸음의
 *   운동이 여기서 **출발 그림**을 꺼냈다 (`before.ix === seat.ix` 로 안 움직인 자리를
 *   고르고, `before.held` 로 떠나는 것이 임자인지 가렸고, `before.ox/oy` 로 유령의
 *   글자를 적었다). `getAttribute` 를 안 쓰니 ④ 의 grep 을 지나가지만 병은 같다 —
 *   되짚어 세운 직후에는 그 표가 옛 화면의 것이라 엉뚱한 데서 출발한다 (함정 28).
 *   지금은 자취(`answers`)의 한 칸 앞이 그 자리를 말한다.
 * - `type SeatView = { ox, oy, ix, iy, held }` — **좌표 사본 넷과 깃발 하나.**
 *   `ox/oy` 는 자리의 임자, `ix/iy` 는 지금 앉은 것인데, 둘 다 *누구냐* 를 좌표로
 *   적은 것이었다. 지금은 점 **번호** 둘이고 (`owner` · `holder`), 좌표는 바탕의
 *   `points` 에서 꺼낸다. `held` 도 담지 않는다 — `owner === holder` 면 지킨 것이다.
 * - `const ghosts = new Map<number, SVGGElement>()` · `const links` — **자리가
 *   있느냐 자체가 상태였다.** "이 자리의 임자가 지금 밖에 나와 있나" 를 맵의 유무가
 *   쥐었고, `dropGhost` / `raiseGhost` 가 그 유무를 걸음마다 고쳤다 (함정 36).
 *   지금은 `owner !== holder` 라는 한 물음에서 나온다.
 * - `tickLayer` 의 **자식 수와 각도** — 지나온 재현율이 오직 거기에만 쌓였다.
 *   `addTick` 만 있고 지우는 명령이 없어 되감으면 눈금이 그대로 남았다. 지금은
 *   `answers` 를 훑어 매번 다시 세운다.
 * - `type AnswerView = { seats, recall, probe, caption: string }` — **`probe` 와
 *   `caption` 이 문안이다** (C10). projector 가 `tr` 로 만들어 stage 로 밀어 넣고
 *   있었다. 타입째 없앴고 문자는 그리는 쪽이 `params.t` 로 만든다.
 *
 * ── 무엇을 싣고 무엇을 세는가 (프로토콜 2-4 절의 갈래)
 *
 * | 무엇 | 어디서 |
 * | --- | --- |
 * | 어느 칸을 열었나 (`opened`) | **싣는다** — 대표까지의 거리로 차례를 가리는 것이 걸음의 판정이다 |
 * | 자리마다 누가 앉았나 (`holders`) | **싣는다** — 빈자리에 어느 것이 올라오는지가 이 조각의 셈 그 자체다 |
 * | 참값 다섯이 누구인가 (`order`) | **싣는다** — 전수로 잰 거리의 판정이다 |
 * | 본 점의 수 | **장면이 센다** — 연 칸에 든 점을 바탕에서 세면 나온다 |
 * | 재현율 | **장면이 센다** — 자리를 지킨 임자를 세면 나온다 |
 * | 몇 번째 답인가 · 칸의 총수 · 점의 총수 | **장면이 센다** — 자취의 길이와 바탕의 길이다 |
 *
 * 재현율을 싣지 않는 것이 이 이행의 알맹이다. 옛 발신은 그것을 못박아 보냈고
 * 화면은 그림과 따로 받아 적었다 — **자리를 세어 나오는 수와 두 출처**였다.
 * 지금은 고리에 선 자리를 세는 함수 하나(`recallAt`)를 계기도 장부도 캡션도
 * 함께 부르므로 갈릴 자리가 없다 (함정 34).
 *
 * 좌표는 담지 않는다 — 고리 위의 자리도 바깥 자리도 캔버스에서 역산한다 (S-piece).
 * 문안도 담지 않는다 — 무엇을 말할지는 `phaseOf` 가 내고 문자는 그리는 쪽이
 * `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 바탕의 점 하나. 화면 좌표가 아니라 데이터 좌표이고, `cell` 은 속한 무리다. */
export type RecallScenePoint = { x: number; y: number; cell: number };

/** 폭 하나로 다시 낸 답. */
export type RecallAnswer = {
  /** 이 폭에서 연 칸의 번호. 길이가 곧 연 칸의 수다. */
  opened: readonly number[];
  /** 자리마다 지금 앉은 점의 번호. 차례가 곧 자리의 차례다. */
  holders: readonly number[];
};

/** 자리 하나를 읽은 것. 장면이 담는 것이 아니라 `seatsAt` 이 셈해 내주는 값이다. */
export type RecallSeat = {
  /** 이 자리의 임자 — 참값에서 그 자리를 차지해야 할 점. */
  owner: number;
  /** 지금 이 자리에 앉아 있는 점. */
  holder: number;
  /** 임자가 제자리를 지키고 있나. */
  held: boolean;
};

/** 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다. */
export type RecallStep =
  /** 참값 다섯이 가운데에서 제 자리로 퍼진다. */
  | { kind: 'truth' }
  /** 빠지는 것과 메우는 것이 같은 걸음에 엇갈려 난다. */
  | { kind: 'answer' }
  /** 마지막 말. 흐를 것이 없다. */
  | { kind: 'done' };

/**
 * 지금 화면이 서 있는 국면. 걸음이 아니라 **자취**에서 나온다.
 *
 * 같은 걸음을 몇 번 다시 그려도 같은 국면이 나와야 하므로 `step` 을 읽지 않는다 —
 * 정적 그리기가 `step` 을 보면 흘려 세운 화면과 곧바로 세운 화면이 같은 `step` 을
 * 보아 자체 검증 축 1 이 그 차이를 구조적으로 못 잡는다.
 */
export type RecallPhase =
  /** 아직 참값이 안 정해졌다. 빈 고리만 서 있다. */
  | { kind: 'empty' }
  /** 참값 다섯이 자리에 앉았다. 아직 아무 칸도 안 열었다. */
  | { kind: 'truth' }
  /** `index` 번째 답을 세운 화면. */
  | { kind: 'answer'; index: number }
  /** 다 보였다. 세우는 화면은 마지막 답 그대로다. */
  | { kind: 'done'; index: number };

export type RecallSpeedTradeoffScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 점 전부. 값만 베껴 담는다 — 러너가 주는 배열을 참조로 쥐지 않는다. */
  points: readonly RecallScenePoint[];
  /** 무리(칸)의 총수. 장부의 칸 수와 "연 칸 x/N" 의 N 이 여기서 나온다. */
  cellCount: number;
  /** 고리에 세울 자리의 수. 참값이 오기 전에도 빈 자리를 그려야 하므로 바탕이다. */
  k: number;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /**
   * 참값 다섯이 누구인가 — 가까운 차례대로의 점 번호.
   *
   * 비어 있으면 아직 안 정해진 것이다. 채워지면 길이가 반드시 `k` 다 (`reduce` 가
   * 그렇지 않은 발신을 흘린다) — 자리 수를 두 군데서 셈하지 않기 위한 빗장이다.
   */
  truth: readonly number[];
  /**
   * 폭을 하나씩 넓히며 낸 답들. **쌓인다.**
   *
   * 옛 화면은 `current` 한 벌만 쥐어 앞 답이 다음 걸음에 지워졌다. 이 조각의 주장이
   * "덜 뒤지면 놓친다" 라는 **맞바꿈**인데, 산 값(연 칸 · 본 점)과 얻은 값(재현율)의
   * 짝이 한 화면에 함께 있지 않으면 맞바꿈이 보이지 않는다.
   */
  answers: readonly RecallAnswer[];
  /** 마쳤나. 세우는 화면은 마지막 답 그대로이고 캡션만 결론으로 바뀐다. */
  finished: boolean;

  step: RecallStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `truth` · `answers` · `finished` 는 걸어온 자취라 여기 넣지 않는다 — 넣으면
 * 되감은 화면이 이미 다 찬 장부를 단 채로 서고 그 위에 algorithm 이 처음부터 다시
 * 세우는 것이 겹친다 (S-scene).
 */
type Base = Pick<RecallSpeedTradeoffScene, 'points' | 'cellCount' | 'k'>;

/**
 * 되돌린 뒤의 장면 — 빈 고리만 서 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 TypeScript 의 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로
 * 통과한다 (S-scene).
 */
function atStart(base: Base): RecallSpeedTradeoffScene {
  return {
    points: base.points,
    cellCount: base.cellCount,
    k: base.k,
    truth: [],
    answers: [],
    finished: false,
    step: null,
  };
}

// ── 선언과 발신 좁히기 ────────────────────────────────────────────────────
//
// 생산자가 같은 패키지라도 경계는 경계다 (C9). 좁히는 자리는 여기 하나이고
// 그리는 쪽은 장면만 받는다 — 두 벌이 되면 자리의 수가 갈린다.

function fields(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 점 목록. 값만 베껴 새 배열로 돌려준다 — 넘겨받은 것을 참조로 쥐지 않는다. */
function readPoints(raw: unknown): RecallScenePoint[] {
  if (!Array.isArray(raw)) return [];
  const out: RecallScenePoint[] = [];
  for (const item of raw) {
    const p = fields(item);
    const x = num(p?.x);
    const y = num(p?.y);
    const cell = num(p?.cell);
    if (x === null || y === null || cell === null || !Number.isInteger(cell)) continue;
    out.push({ x, y, cell });
  }
  return out;
}

/**
 * 고리에 세울 자리의 수.
 *
 * 옛 stage 의 `readSeatCount` 가 쥐던 잣대를 그대로 옮겨 왔다 — 좁히는 규칙이 두
 * 벌이 되지 않게 이제 stage 는 `initialData` 를 읽지 않는다 (S-piece).
 */
function readSeatCount(raw: unknown): number {
  const k = num(raw);
  return k !== null && k >= 3 && k <= 8 ? Math.floor(k) : 5;
}

/** 번호 목록. 전부 `limit` 미만의 정수여야 하고, `length` 가 있으면 수도 맞아야 한다. */
function readIndices(raw: unknown, limit: number, length: number | null): number[] | null {
  if (!Array.isArray(raw)) return null;
  if (length !== null && raw.length !== length) return null;
  const out: number[] = [];
  for (const item of raw) {
    const i = num(item);
    if (i === null || !Number.isInteger(i) || i < 0 || i >= limit) return null;
    out.push(i);
  }
  return out;
}

// ── 장면에서 셈해지는 것들 ────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 계기의 바늘도 장부의 글자도 캡션의 수도
// 같은 함수를 부르므로 갈릴 자리가 없다.

/**
 * `index` 번째 답에서 자리마다 앉은 점.
 *
 * 범위 밖이면 참값 그대로다 — 곧 **아무 칸도 안 열었을 때의 그림**이라, 첫 답의
 * 운동이 어디서 출발하는지도 여기서 나온다. `prev` 도 DOM 도 들추지 않는다.
 */
export function holdersAt(
  scene: RecallSpeedTradeoffScene,
  index: number,
): readonly number[] {
  const answer = scene.answers[index];
  return answer === undefined ? scene.truth : answer.holders;
}

/** `index` 번째 답의 자리 다섯. 임자와 지금 앉은 것과 지켰는지. */
export function seatsAt(scene: RecallSpeedTradeoffScene, index: number): RecallSeat[] {
  const holders = holdersAt(scene, index);
  return scene.truth.map((owner, i): RecallSeat => {
    const holder = holders[i] ?? owner;
    return { owner, holder, held: holder === owner };
  });
}

/** `index` 번째 답에서 임자가 자리를 지킨 수. 그림에 선 자리를 그대로 센다. */
export function heldCountAt(scene: RecallSpeedTradeoffScene, index: number): number {
  return seatsAt(scene, index).filter((seat) => seat.held).length;
}

/**
 * `index` 번째 답의 재현율(백분율).
 *
 * **그림과 같은 자료에서 나온다** — 고리에 선 자리를 세고 자리의 총수로 나눈다.
 * 반올림을 실수 없이 하려고 (맞힌 수 × 100 + k/2) 를 k 로 정수 나눗셈한다.
 */
export function recallAt(scene: RecallSpeedTradeoffScene, index: number): number {
  const k = scene.k;
  if (k <= 0) return 0;
  return Math.floor((heldCountAt(scene, index) * 100 + Math.floor(k / 2)) / k);
}

/** `index` 번째 답에서 본 점의 수 — 연 칸에 든 점을 바탕에서 센다. */
export function seenAt(scene: RecallSpeedTradeoffScene, index: number): number {
  const answer = scene.answers[index];
  if (answer === undefined) return 0;
  const opened = new Set(answer.opened);
  let seen = 0;
  for (const point of scene.points) {
    if (opened.has(point.cell)) seen += 1;
  }
  return seen;
}

/** `index` 번째 답에서 연 칸의 수. */
export function openedAt(scene: RecallSpeedTradeoffScene, index: number): number {
  return scene.answers[index]?.opened.length ?? 0;
}

/** 지금 화면이 세우는 답의 번호. 아직 답이 없으면 -1. */
export function shownAnswer(scene: RecallSpeedTradeoffScene): number {
  return scene.answers.length - 1;
}

/** 지금 화면이 선 국면. `step` 이 아니라 자취에서 낸다. */
export function phaseOf(scene: RecallSpeedTradeoffScene): RecallPhase {
  if (scene.truth.length === 0) return { kind: 'empty' };
  const index = scene.answers.length - 1;
  if (scene.finished) return { kind: 'done', index };
  if (index < 0) return { kind: 'truth' };
  return { kind: 'answer', index };
}

export const recallSpeedTradeoffScene: ScenePlan<RecallSpeedTradeoffScene> = {
  /**
   * 첫 장면은 빈 고리다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. **넘겨받은
   * 것을 참조로 쥐지 않는다** — 점 배열은 러너가 mechanism 과 view 에 함께 주는 한
   * 객체라, 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
   */
  initial(initialData: unknown): RecallSpeedTradeoffScene {
    const d = fields(initialData) ?? {};
    const cells = d.cells;
    return atStart({
      points: readPoints(d.points),
      cellCount: Array.isArray(cells) ? cells.length : 0,
      k: readSeatCount(d.k),
    });
  },

  reduce(
    scene: RecallSpeedTradeoffScene,
    event: FacetRuntimeEvent,
  ): RecallSpeedTradeoffScene {
    const p = fields(event.payload);

    switch (event.type) {
      /*
       * 참값이 정해진다. 전수로 잰 거리의 판정이라 번호가 실려 온다 — 좌표는 싣지
       * 않는다. 번호만 있으면 바탕에서 좌표가 나오고, 자리를 지켰나도 번호 견줌이다.
       *
       * 한 바퀴의 처음이므로 자취를 턴다. 되감기 직후에도, 처음 마운트에서도 같다.
       */
      case 'truth-fixed': {
        const order = readIndices(p?.order, scene.points.length, scene.k);
        if (order === null) return scene;
        return {
          ...atStart({ points: scene.points, cellCount: scene.cellCount, k: scene.k }),
          truth: order,
          step: { kind: 'truth' },
        };
      }

      /*
       * 폭 하나로 다시 낸 답. 연 칸과 자리의 임자만 받는다 — 본 점의 수도 재현율도
       * 몇 번째 답인가도 여기서 셈하지 않는다 (위 갈래표).
       */
      case 'answer-recomputed': {
        if (scene.truth.length === 0) return scene;
        const opened = readIndices(p?.opened, scene.cellCount, null);
        const holders = readIndices(p?.holders, scene.points.length, scene.k);
        if (opened === null || holders === null || opened.length === 0) return scene;
        return {
          ...scene,
          answers: [...scene.answers, { opened, holders }],
          step: { kind: 'answer' },
        };
      }

      /* 마침. 세우는 화면은 마지막 답 그대로라 실려 오는 것이 없다. */
      case 'done':
        if (scene.finished) return scene;
        return { ...scene, finished: true, step: { kind: 'done' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ points: scene.points, cellCount: scene.cellCount, k: scene.k });

      default:
        // 이 algorithm 이 발신하는 것은 위 넷이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
