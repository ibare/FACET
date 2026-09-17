/**
 * SupportVectorsOnly 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 에는 `let` 이 한 자리도 없었고 조회로 갈리는 분기도 없었다.
 * **상태는 전부 stage 에 있었다.**
 *
 * - `let gaugeLo` · `let gaugeHi` — **기록 눈금의 척도.** 오른쪽 기둥의 모든 세로
 *   자리가 `gy()` 를 지나므로 이 둘이 기록 전체의 좌표를 정했다. 첫 풀이를 받을 때
 *   한 번 적어 두고 그 뒤로 계속 쓰는 짜임이라, 되짚어 세운 직후에는 아직 옛
 *   화면의 척도였다. 지금은 `first` 하나만 장면에 담고 눈금은 그리는 쪽이 매번
 *   셈한다 (`layoutOf`).
 * - `let ghostSet` · `let baseIntercept` — **견줌의 기준.** "처음 선이 어디였나" 는
 *   이 조각의 주장 그 자체인데, 그것을 stage 가 깃발 하나와 수 하나로 쥐고 있었다.
 *   되짚어 세운 직후에 그 둘이 옛 화면의 것이면 유령 띠도 기록의 점선도 어긋난
 *   자리에 선다. 지금은 `first` 가 장면에 있다.
 * - `let nodes: Node[]` — `Node = { wrap, ring, x, y, alive, support }`. **DOM 손잡이와
 *   뜻·수치가 한 객체**다. 점이 지금 어디 있는지(`x`/`y`), 버려졌는지(`alive`),
 *   선을 정했는지(`support`)가 전부 여기 있었고 `const nodes` 가 아니라 `let` 이라
 *   ② 로는 잡혀도 알맹이가 무엇인지는 눈으로 읽어야 보였다. 지금은 `points` ·
 *   `dropped` · `solution.supports` 세 축으로 갈라 장면이 말한다.
 * - `let slot` — 기록 기둥이 몇 개 섰나. 늘 하나씩 쌓이므로 `records.length` 다.
 *
 * ── 화면을 되읽어 운동의 출발값을 삼던 자리 셋
 *
 * - `revealRings()` 의 `node.ring.getAttribute('opacity')` — 고리의 **지금 투명도를
 *   통째로 되읽어** 흐림/짙어짐의 출발값으로 삼았다 (④ 의 정본). 되짚어 세운
 *   직후에는 그것이 옛 화면의 고리들이라 엉뚱한 데서 출발한다. 지금은
 *   `step.wasSupports` 가 *직전에 어느 고리가 서 있었나* 를 말한다.
 * - `restorePoints()` 의 `nodes.map((node) => ({ x: node.x, y: node.y, alive }))` —
 *   화면의 **거울**을 되읽은 것이라 `getAttribute` 도 `let` 도 아니어서 ②④ 어느
 *   grep 에도 안 걸린다 (함정 28). 지금은 `step.from` · `step.wasDropped` 다.
 * - `movePoint()` 의 `const fromX = node.x` — 같은 병. 옮기기 전 자리를 거울에서
 *   꺼냈다. 지금은 `step.from` 이다.
 *
 * 셋 다 `reduce` 가 **앞 장면을 보고** 계기값으로 실어 둔다. 그리는 쪽이 `prev` 를
 * 들추는 것과 다르다 — `prev` 는 무엇을 흐르게 할지 고르는 데만 쓴다 (S-scene).
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 점의 **값**과 선의 **계수**만 담고 화면 자리는 그리는 쪽이
 * 셈한다 (S-piece). 문안도 담지 않는다 — `step` 이 무엇을 말할지만 말하고 문자는
 * 그리는 쪽이 `params.t` 로 만든다 (C10).
 *
 * 최대 마진을 푸는 셈 자체는 **내주지 않는다.** 그것이 이 조각의 알고리즘이고,
 * 떼어 내면 조각이 말하려는 바가 남지 않는다 (프로토콜 4 절 B 갈래의 경계).
 * 걸음이 싣는 것은 그 풀이의 **판정**뿐이다 — 기울기 · 띠 두 가장자리 · 닿은 점 ·
 * 처음 선과 견준 결과. 절편과 띠 두께는 그 넷에서 곧바로 나오므로 여기서 셈한다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 점 하나. 값이지 자리가 아니다. */
export type SvoPoint = { x: number; y: number; group: 'A' | 'B' };

/**
 * 한 번 푼 결과.
 *
 * 절편과 띠 두께를 필드로 두지 않는다 — `interceptOf` · `marginOf` 가 여기서
 * 셈하므로 화면의 띠와 기록의 수가 같은 자료를 쓴다 (함정 10).
 */
export type SvoSolution = {
  /** 선의 기울기. 띠 두 가장자리도 같은 기울기다. */
  slope: number;
  /** 띠 아래 가장자리의 y 절편. */
  lower: number;
  /** 띠 위 가장자리의 y 절편. */
  upper: number;
  /** 가장자리에 닿은 점의 첨자 — 곧 서포트 벡터다. */
  supports: readonly number[];
  /** 처음 선과 견준 결과. 이 판정은 훑기가 내린다. */
  verdict: 'first' | 'same' | 'moved';
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * `from` · `wasSupports` · `wasDropped` 는 출발 그림을 셈으로 되세우는 계기값이다.
 * 화면을 되읽는 대신 장면이 말한다 (S-scene).
 */
export type SvoStep =
  /** 점을 놓는다. 하나씩 차례로 내려앉는다. */
  | { kind: 'place' }
  /**
   * 방향을 훑어 선을 다시 푼다.
   *
   * `wasSupports` 는 훑기 직전에 어느 점에 고리가 서 있었나다. 고리가 그 자리에서
   * 새 자리로 흐른다.
   */
  | { kind: 'solve'; wasSupports: readonly number[] }
  /** 닿은 점을 짚는다. 고리가 한 번 부푼다. */
  | { kind: 'mark' }
  /** 닿지 않은 점을 버린다. `indices` 가 이 걸음이 내린 판정이다. */
  | { kind: 'drop'; indices: readonly number[] }
  /**
   * 앞 손질을 되돌린다.
   *
   * `from` 은 되돌리기 직전 점들의 자리, `wasDropped` 는 그때 버려져 있던 점이다.
   * 둘 다 없으면 어디서 어디로 돌아오는지를 화면에서 되읽어야 한다.
   */
  | { kind: 'restore'; from: readonly SvoPoint[]; wasDropped: readonly number[] }
  /** 점 하나를 옮긴다. `from` 은 떠난 자리다. */
  | { kind: 'move'; index: number; from: SvoPoint }
  /** 다 보였다. 닿지 않은 점이 옅어지고 닿은 점만 남는다. */
  | { kind: 'done' };

export type SupportVectorsOnlyScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 선언에 적힌 점의 처음 자리. 되돌리기가 여기로 온다. */
  base: readonly SvoPoint[];
  /** 손질이 점을 옮겨 가는 자리. 무대의 배율이 이것까지 담아야 한다. */
  moveTargets: readonly { x: number; y: number }[];
  /** 손질의 수. 기록 기둥이 설 칸 수를 정한다. */
  editCount: number;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 점이 지금 선 자리. 손질이 고친다. */
  points: readonly SvoPoint[];
  /** 지금 버려져 있는 점. */
  dropped: readonly number[];
  /** 무대에 선 선. 아직 풀지 않았으면 null. */
  solution: SvoSolution | null;
  /** 처음 푼 선. 유령 띠와 기록의 점선이 여기서 나온다 — 견줌의 기준이다. */
  first: SvoSolution | null;
  /** 기록 기둥에 쌓인 것, 쌓인 차례대로. */
  records: readonly SvoSolution[];
  /** 완주했나. 닿지 않은 점이 옅어진 채로 남는다. */
  concluded: boolean;

  step: SvoStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `points` 도 자취에 든다 — 손질이 고치므로 되감은 화면은 처음 자리로 돌아가야
 * 한다. 그래서 `base` 와 따로 둔다 (함정 14).
 */
type Base = Pick<SupportVectorsOnlyScene, 'base' | 'moveTargets' | 'editCount'>;

/**
 * 아무것도 풀리지 않은 처음 화면.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): SupportVectorsOnlyScene {
  return {
    base: base.base,
    moveTargets: base.moveTargets,
    editCount: base.editCount,
    points: base.base,
    dropped: [],
    solution: null,
    first: null,
    records: [],
    concluded: false,
    step: null,
  };
}

// ── 좁히기. 생산자가 같은 패키지라도 경계는 경계다 (C9).

function fields(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readPoints(value: unknown): SvoPoint[] {
  if (!Array.isArray(value)) return [];
  const out: SvoPoint[] = [];
  for (const raw of value) {
    const rec = fields(raw);
    const x = rec === null ? null : num(rec.x);
    const y = rec === null ? null : num(rec.y);
    if (rec === null || x === null || y === null) continue;
    out.push({ x, y, group: rec.group === 'B' ? 'B' : 'A' });
  }
  return out;
}

function readIndexList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0);
}

/** 손질이 점을 옮겨 가는 자리. 무대의 배율이 그것까지 담아야 한다. */
function readMoveTargets(value: unknown): { x: number; y: number }[] {
  if (!Array.isArray(value)) return [];
  const out: { x: number; y: number }[] = [];
  for (const raw of value) {
    const rec = fields(raw);
    const x = rec === null ? null : num(rec.toX);
    const y = rec === null ? null : num(rec.toY);
    if (x === null || y === null) continue;
    out.push({ x, y });
  }
  return out;
}

/** 훑기가 내린 판정. 넷 중 하나라도 수가 아니면 그 걸음을 조용히 흘린다 (C2). */
function readSolution(payload: unknown): SvoSolution | null {
  const rec = fields(payload);
  if (rec === null) return null;
  const slope = num(rec.slope);
  const lower = num(rec.lower);
  const upper = num(rec.upper);
  if (slope === null || lower === null || upper === null) return null;
  return {
    slope,
    lower,
    upper,
    supports: readIndexList(rec.supports),
    verdict: rec.verdict === 'same' ? 'same' : rec.verdict === 'moved' ? 'moved' : 'first',
  };
}

// ── 장면에서 셈해지는 것들 ────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 띠도 선도 기록의 두께도 같은 함수를 부르므로
// 갈릴 자리가 없다.

/** 선의 y 절편 — 띠 두 가장자리의 한가운데다. */
export function interceptOf(sol: SvoSolution): number {
  return (sol.lower + sol.upper) / 2;
}

/**
 * 띠 두께 — 두 가장자리 사이의 **수직** 거리.
 *
 * 절편 차이가 아니라 기울기로 눕힌 거리다. 기울어진 띠일수록 절편 차이보다 좁다.
 */
export function marginOf(sol: SvoSolution): number {
  return (sol.upper - sol.lower) / Math.hypot(1, sol.slope);
}

/** 그 점이 지금 무대에 남아 있나. */
export function isAlive(scene: SupportVectorsOnlyScene, index: number): boolean {
  return !scene.dropped.includes(index);
}

/**
 * 지금 남아 있는 점의 무게중심. 훑기가 이 자리를 축으로 돈다.
 *
 * 남은 것이 없으면 바탕 전부로 센다 — 풀 것이 없으면 훑지도 않으므로 닿지 않는
 * 갈래이지만, 0 을 돌려주면 그 자리가 뜻 없는 좌표가 된다.
 */
export function liveCentroid(scene: SupportVectorsOnlyScene): { x: number; y: number } {
  const alive = scene.points.filter((_, i) => isAlive(scene, i));
  const use = alive.length > 0 ? alive : scene.base;
  if (use.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of use) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / use.length, y: sy / use.length };
}

/** 그 점이 **처음** 선을 정했나. 손질의 크기가 아니라 이것이 가른다. */
export function wasSupport(scene: SupportVectorsOnlyScene, index: number): boolean {
  return scene.first !== null && scene.first.supports.includes(index);
}

export const supportVectorsOnlyScene: ScenePlan<SupportVectorsOnlyScene> = {
  /**
   * 첫 장면은 빈 무대다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 넘겨받은
   * 배열을 참조로 쥐지 않는다 — 값만 꺼내 새 목록을 만든다 (S-scene).
   */
  initial(initialData: unknown): SupportVectorsOnlyScene {
    const d = fields(initialData) ?? {};
    return atStart({
      base: readPoints(d.points),
      moveTargets: readMoveTargets(d.edits),
      editCount: Array.isArray(d.edits) ? d.edits.length : 0,
    });
  },

  reduce(
    scene: SupportVectorsOnlyScene,
    event: FacetRuntimeEvent,
  ): SupportVectorsOnlyScene {
    switch (event.type) {
      /* 점을 놓는다. 자리는 선언이 말한 처음 자리다. */
      case 'points-placed':
        return { ...scene, points: scene.base, dropped: [], step: { kind: 'place' } };

      /*
       * 훑어 얻은 선. 처음 것이면 견줌의 기준으로도 남는다.
       *
       * 고리가 어디서 흘러오는지는 **지금 장면**이 말한다 — 그리는 쪽이 `prev` 를
       * 들추면 되짚어 세운 직후에 옛 화면의 고리에서 출발한다 (S-scene).
       */
      case 'boundary-solved': {
        const sol = readSolution(event.payload);
        if (sol === null) return scene;
        return {
          ...scene,
          solution: sol,
          first: scene.first ?? sol,
          records: [...scene.records, sol],
          step: { kind: 'solve', wasSupports: scene.solution?.supports ?? [] },
        };
      }

      /* 닿은 점을 짚는 걸음. 화면은 그대로이고 말이 달라진다. */
      case 'supports-marked':
        return { ...scene, step: { kind: 'mark' } };

      /* 닿지 않은 점을 버린다. 이미 버려진 것 위에 겹쳐 세지 않는다. */
      case 'points-dropped': {
        const indices = readIndexList(
          fields(event.payload)?.indices,
        ).filter((i) => i < scene.points.length && !scene.dropped.includes(i));
        if (indices.length === 0) return scene;
        return {
          ...scene,
          dropped: [...scene.dropped, ...indices],
          step: { kind: 'drop', indices },
        };
      }

      /* 앞 손질을 되돌린다. 떠나온 자리를 계기값으로 실어 둔다. */
      case 'points-restored':
        return {
          ...scene,
          points: scene.base,
          dropped: [],
          step: { kind: 'restore', from: scene.points, wasDropped: scene.dropped },
        };

      /* 점 하나를 옮긴다. 앞 장면을 제자리에서 고치지 않고 새 목록을 짓는다. */
      case 'point-moved': {
        const rec = fields(event.payload);
        const index = rec === null ? null : num(rec.index);
        const toX = rec === null ? null : num(rec.toX);
        const toY = rec === null ? null : num(rec.toY);
        if (index === null || toX === null || toY === null) return scene;
        const from = scene.points[index];
        if (from === undefined) return scene;
        const points = scene.points.map((p, i) =>
          i === index ? { x: toX, y: toY, group: p.group } : p,
        );
        return { ...scene, points, step: { kind: 'move', index, from } };
      }

      /* 다 보였다. 닿지 않은 점이 옅어진 채로 남는다 — 이것이 조각의 결론이다. */
      case 'done':
        return { ...scene, concluded: true, step: { kind: 'done' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({
          base: scene.base,
          moveTargets: scene.moveTargets,
          editCount: scene.editCount,
        });

      default:
        // 이 algorithm 이 발신하는 것은 위 일곱이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
