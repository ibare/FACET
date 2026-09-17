/**
 * probeAFewCells 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 에는 `let` 도 조회 분기도 없었다. **상태는 전부 stage 에 있었고, 그나마도
 * 변수가 아니라 화면 그 자체였다.**
 *
 * - `const opened = new Set<number>()` — 이름은 손잡이 같지만 **이 조각의 결론**이었다.
 *   `stopProbe()` 가 `cells.filter((_, i) => !opened.has(i))` 로 *끝내 안 연 칸*을
 *   가려냈으니, 그 집합이 곧 "몇 칸만 열었다" 라는 주장의 유일한 근거였다. `let` 도
 *   아니고 stage 안에 있어 ①③ 어느 grep 에도 안 걸린다. 지금은 `opened` 자취가 쥔다.
 * - **견준 점이 점의 `fill` 에만 있었다.** `dot.setAttribute('fill', itemComparing)` 이
 *   쌓이기만 하고 되돌리는 명령이 없어, *손대지 않은 점*은 "아직 아무도 안 칠한 점"
 *   이라는 부재로만 화면에 남았다. 걸음을 건너뛰어 맺음 화면을 곧바로 세우면 그 칠이
 *   하나도 없어 **스물넷이 전부 손대지 않은 점**이 된다 — 조각의 주장이 통째로
 *   사라지는 자리다. 지금은 `opened` 의 `members` 가 그 답을 쥔다.
 * - **자취가 전부 DOM 에 쌓이고 있었다** — 뻗은 자(`ruler` 의 `x2`/`y2`), 거리 글자,
 *   `gSpokes` 의 자식들, 띠(`ring` 의 `d`), 순위 글자. `resetVisuals()` 스물아홉 줄이
 *   그 목록을 손으로 되돌리던 자리이고, 그 목록이 통째로 없어졌다.
 * - `type Scene = { points, centroids, query }` (stage `:37`) — **이름이 장면과 부딪혀
 *   있었다.** 좁히개(`readScene`)가 통째로 여기 `initial` 로 옮겨 오며 stage 에서
 *   사라졌다.
 * - `type CellUi = { site, out, span, lid, edge, mark, ruler, distText, … }` (stage `:137`)
 *   — DOM 손잡이와 기하가 한 객체였다. `site`·`out`·`span` 은 대표·질의·캔버스에서
 *   곧바로 나오는 값이라 적어 둘 까닭이 없다. 지금은 그리는 쪽이 매번 셈한다.
 * - `Number(dot.getAttribute('cx'))` (stage `:551`) — **화면을 되읽어 자취의 도착 자리를
 *   정했다** (④). 점의 자리는 바탕 좌표에서 나오는 값이라 화면에 물을 일이 아니다.
 * - `const s = PLOT_H / Y_SPAN` 와 `DATA_CX`·`DATA_CY` — **척도가 상수로 박혀 있었다.**
 *   점이 1~12 에 있다는 것을 사람이 읽고 적어 둔 수라, 바탕이 바뀌면 그림이 거짓이
 *   된다. 지금은 점·대표·질의를 전부 담게 그리는 쪽이 매번 셈한다 (S-piece).
 *
 * ── 어디를 나누고 어디가 가까운지 셈하는 것은 내주지 않는다 (프로토콜 4 절 B 갈래)
 *
 * **점이 어느 칸에 드는지 찾는 셈과 어느 칸이 가까운지 고르는 셈이 이 조각의 알고리즘
 * 그 자체다.** 장면이 그것을 다시 풀면 조각이 피하려는 셈을 장면이 하게 되고 발신이
 * 장식이 된다. 그래서 **판정만** 싣는다 — 칸마다 점이 몇인가(`counts`), 어느 칸을
 * 재고 있나(`cell`), 가까운 차례가 무엇인가(`order`), 어느 칸을 열었고 그 안에 어느
 * 점이 들었나(`cell`·`members`).
 *
 * 나머지는 전부 걷어냈다. **점의 총수**는 바탕을 세면 나오고, **칸의 수**도 그렇다.
 * **지금까지 견준 점**은 연 칸의 `members` 를 이으면 나오고 **손대지 않은 점**은 그
 * 나머지다. **질의에서 대표까지의 거리**는 두 점을 이미 알고 있을 때의 `Math.hypot`
 * 이라 — 어느 칸을 잴지는 걸음이 이미 정해 주었으므로 탐색이 아니다 — 장면이 잰다.
 * 그래서 화면에 뜨는 거리는 자에 달리는 숫자도, 띠의 안팎 반지름도, 캡션의 수도 전부
 * `distanceTo` 하나를 지난다.
 *
 * **`counts` 는 수로 싣고 소속으로 싣지 않는다.** 안 연 칸의 점이 누구인지는 발신이
 * 끝내 말하지 않는다 — 손대지 않은 칸의 속을 화면이 알지 못한다는 것이 이 조각의
 * 주장과 같은 모양이라, 그 경계를 발신에서도 지킨다.
 *
 * ── 안 연 칸이 논증의 절반이다
 *
 * 이 조각의 주장은 "전부 보지 않고 몇 칸만 열어도 웬만큼 찾는다" 이고, 그 결정타는
 * **끝내 안 연 칸**이다. 옛 화면에서 그것이 살아남은 것은 뚜껑을 되돌리는 명령이
 * 없어서였다. 장면으로 옮기면 그 누적이 저절로 사라지므로, `opened` 와 `order` 를
 * 자취로 올려 **연 칸과 안 연 칸 · 짚은 순위와 건너뛴 순위**를 정적 그리기가 매번
 * 다시 세운다.
 *
 * 좌표는 담지 않는다. 점과 대표의 **값**만 담고 화면 자리는 캔버스에서 역산하는 값이라
 * 그리는 쪽의 몫이다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지는 `step` 과 자취에서
 * 파생되고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 평면 위의 한 자리. 자료 좌표의 **값**이지 화면 자리가 아니다. */
export type ProbePoint = { x: number; y: number };

/** 뚜껑이 열린 칸 하나. */
export type OpenedCell = {
  /** 칸 번호. **배열 색인이라 0 부터** 센다 (화면과 글은 1 부터). */
  cell: number;
  /**
   * 그 칸에 든 점들.
   *
   * **걸음이 내리는 판정이다** — 점이 어느 칸에 드는지 찾는 셈이 이 조각의 알고리즘
   * 그 자체라, 장면이 다시 풀지 않는다.
   */
  members: readonly number[];
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 하나도 싣지 않는다 — 질의가 어디서 내려앉는지도, 자가 어디서 뻗는지도,
 * 뚜껑이 어느 쪽으로 밀리는지도 전부 바탕과 자취에서 셈하므로 `prev` 를 들출 일이
 * 없다 (S-scene).
 */
export type ProbeStep =
  /** 질의가 평면에 내려앉는다. */
  | { kind: 'place' }
  /** 갈라짐이 드러나고 대표가 선다. */
  | { kind: 'split' }
  /** 자가 질의에서 대표까지 뻗는다. */
  | { kind: 'measure' }
  /** 잰 값들이 한 띠 안에 들고 차례가 매겨진다. */
  | { kind: 'rank' }
  /** 뚜껑이 밀려 나가고 드러난 점이 하나씩 견줘진다. */
  | { kind: 'open' }
  /** 멈춘다. 남은 뚜껑이 되눌린다. */
  | { kind: 'stop' };

export type ProbeAFewCellsScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 평면에 놓인 점. 차례가 곧 발신이 가리키는 색인이다. */
  points: readonly ProbePoint[];
  /** 칸마다 하나씩인 대표. 차례가 곧 칸 번호(0 부터)다. */
  centroids: readonly ProbePoint[];
  /** 질의. 모든 거리의 기준이다. */
  query: ProbePoint;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 질의가 내려앉았나. 앉기 전에는 평면에 질의가 없다. */
  placed: boolean;
  /**
   * 칸마다의 점 수. 아직 갈라짐이 드러나지 않았으면 null.
   *
   * 안 연 칸에도 점이 이만큼 있는데 손도 대지 않는다는 것이 이 조각의 주장이라,
   * **수는 네 칸 모두에 대해** 화면에 선다.
   */
  counts: readonly number[] | null;
  /** 자를 대 본 칸, 잰 차례대로. 길이가 곧 몇 칸을 재었나다. */
  measured: readonly number[];
  /** 가까운 차례. 아직 매겨지지 않았으면 null. **걸음이 내리는 판정이다.** */
  order: readonly number[] | null;
  /** 연 칸, 연 차례대로. 길이가 곧 몇 칸을 열었나다. */
  opened: readonly OpenedCell[];
  /** 멈췄나. 참이면 남은 칸은 이 질의에서 끝내 열리지 않는다. */
  stopped: boolean;

  step: ProbeStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * 자취는 여기 넣지 않는다 — 넣으면 되감은 화면이 이미 열린 뚜껑을 단 채로 서고 그
 * 위에 algorithm 이 처음부터 다시 세우는 것이 겹친다 (S-scene).
 */
type Base = Pick<ProbeAFewCellsScene, 'points' | 'centroids' | 'query'>;

/**
 * 되돌린 뒤의 장면 — 점과 덮인 뚜껑만 서 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를 넘기면
 * TypeScript 의 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): ProbeAFewCellsScene {
  return {
    points: base.points,
    centroids: base.centroids,
    query: base.query,
    placed: false,
    counts: null,
    measured: [],
    order: null,
    opened: [],
    stopped: false,
    step: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function fields(payload: unknown): Record<string, unknown> | null {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** `[x, y]` 한 쌍. 자리가 아니라 값이다. */
function readPoint(v: unknown): ProbePoint | null {
  if (!Array.isArray(v) || v.length < 2) return null;
  const x = num(v[0]);
  const y = num(v[1]);
  return x === null || y === null ? null : { x, y };
}

function readPoints(v: unknown): ProbePoint[] {
  if (!Array.isArray(v)) return [];
  const out: ProbePoint[] = [];
  for (const raw of v) {
    const p = readPoint(raw);
    if (p !== null) out.push(p);
  }
  return out;
}

/** 0 이상 `count` 미만의 색인 열. 바탕 밖을 가리키는 것은 버린다. */
function readIndices(v: unknown, count: number): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const raw of v) {
    const n = num(raw);
    if (n === null || !Number.isInteger(n) || n < 0 || n >= count) continue;
    out.push(n);
  }
  return out;
}

/** 0 이상의 세는 수 열. 색인이 아니라 **수**라 위 끝이 없다. */
function readCounts(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const raw of v) {
    const n = num(raw);
    if (n === null || !Number.isInteger(n) || n < 0) continue;
    out.push(n);
  }
  return out;
}

// ── 장면에서 셈해지는 것들 ────────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 자에 달리는 숫자도, 띠의 반지름도, 캡션의 수도
// 같은 함수를 부르므로 갈릴 자리가 없다.

/**
 * 질의에서 칸 `cell` 의 대표까지.
 *
 * **이것은 내주는 함수가 아니라 장면이 셈하는 것이다** — 두 점을 이미 알고 있을 때의
 * `Math.hypot` 은 탐색이 아니라 자로 재는 일이고, 어느 칸을 잴지는 걸음이 이미 정해
 * 주었다. 어느 칸이 가까운지 **고르는** 셈만 algorithm 의 몫이다 (`order`).
 */
export function distanceTo(scene: ProbeAFewCellsScene, cell: number): number {
  const c = scene.centroids[cell];
  if (c === undefined) return 0;
  return Math.hypot(scene.query.x - c.x, scene.query.y - c.y);
}

/** 실제로 질의와 견줘진 점, 견준 차례대로. 연 칸의 점을 이으면 나온다. */
export function comparedPoints(scene: ProbeAFewCellsScene): number[] {
  const out: number[] = [];
  for (const open of scene.opened) {
    for (const index of open.members) if (!out.includes(index)) out.push(index);
  }
  return out;
}

/** 끝내 손대지 않은 점의 수. 조각의 결론이 이 수와 위 목록에서 함께 나온다. */
export function untouchedCount(scene: ProbeAFewCellsScene): number {
  return scene.points.length - comparedPoints(scene).length;
}

/** 이 칸을 열었나. 열지 않은 칸이 화면에 함께 서야 "몇 칸만" 이 보인다. */
export function isOpened(scene: ProbeAFewCellsScene, cell: number): boolean {
  return scene.opened.some((open) => open.cell === cell);
}

/**
 * 잰 값들이 든 띠의 안팎 반지름. **자료 단위**다 — 화면 길이는 그리는 쪽이 역산한다.
 *
 * 차례가 아직 없으면 null. 안팎이 엇비슷하다는 것 자체가 이 조각의 장치이므로,
 * 그 두 수는 차례의 양 끝을 같은 자로 재어 나온다.
 */
export function ringSpan(scene: ProbeAFewCellsScene): { near: number; far: number } | null {
  const order = scene.order;
  if (order === null || order.length === 0) return null;
  const first = order[0];
  const last = order[order.length - 1];
  if (first === undefined || last === undefined) return null;
  return { near: distanceTo(scene, first), far: distanceTo(scene, last) };
}

export const probeAFewCellsScene: ScenePlan<ProbeAFewCellsScene> = {
  /**
   * 첫 장면은 점과 덮인 뚜껑만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. **넘겨받은
   * 것을 참조로 쥐지 않는다** — 좌표 배열은 러너가 mechanism 과 view 에 함께 주는 한
   * 객체라, 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
   */
  initial(initialData: unknown): ProbeAFewCellsScene {
    const d = fields(initialData) ?? {};
    return atStart({
      points: readPoints(d.points),
      centroids: readPoints(d.centroids),
      query: readPoint(d.query) ?? { x: 0, y: 0 },
    });
  },

  reduce(scene: ProbeAFewCellsScene, event: FacetRuntimeEvent): ProbeAFewCellsScene {
    const f = fields(event.payload);
    const cellCount = scene.centroids.length;

    switch (event.type) {
      /* 질의가 내려앉는다. 점의 총수는 바탕을 세면 나오므로 실어 올 것이 없다. */
      case 'query-placed':
        return { ...scene, placed: true, step: { kind: 'place' } };

      /* 갈라짐이 드러난다. 칸마다 점이 몇인가는 걸음이 내리는 판정이다. */
      case 'cells-split': {
        const counts = readCounts(f?.counts);
        if (counts.length === 0) return scene;
        return { ...scene, counts, step: { kind: 'split' } };
      }

      /* 자를 댄다. 잰 값은 싣지 않는다 — 두 점을 알면 장면이 잰다. */
      case 'centroid-measured': {
        const cell = num(f?.cell);
        if (cell === null || cell < 0 || cell >= cellCount) return scene;
        return { ...scene, measured: [...scene.measured, cell], step: { kind: 'measure' } };
      }

      /* 가까운 차례. 안팎 반지름은 이 차례의 양 끝을 재면 나온다. */
      case 'order-ranked': {
        const order = readIndices(f?.order, cellCount);
        if (order.length === 0) return scene;
        return { ...scene, order, step: { kind: 'rank' } };
      }

      /* 뚜껑이 열린다. 지금까지 견준 점 수는 연 칸의 점을 세면 나온다. */
      case 'cell-opened': {
        const cell = num(f?.cell);
        if (cell === null || cell < 0 || cell >= cellCount) return scene;
        const members = readIndices(f?.members, scene.points.length);
        return {
          ...scene,
          opened: [...scene.opened, { cell, members }],
          step: { kind: 'open' },
        };
      }

      /* 멈춘다. 연 칸도 견준 점도 손대지 않은 점도 전부 자취에 이미 있다. */
      case 'probe-stopped':
        return { ...scene, stopped: true, step: { kind: 'stop' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({
          points: scene.points,
          centroids: scene.centroids,
          query: scene.query,
        });

      default:
        // 이 algorithm 이 발신하는 것은 위 일곱이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
