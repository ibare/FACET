/**
 * 최대 마진 — 후보 선마다 띠가 벌어지다 어느 점에 닿는 순간 멈춘다. (조각)
 *
 * 두 무리를 가르는 선은 무수히 많다. 그러니 물음은 "가르느냐" 가 아니라
 * "얼마나 넉넉히 가르느냐" 다. 후보 기울기마다 그 기울기로 낼 수 있는 가장
 * 두꺼운 띠를 재고, 가장 두껍게 벌어진 것을 답으로 삼는다.
 *
 * ── 식별자
 *   index:<i>   `initialData.points` 배열의 인덱스. 띠에 닿은 점을 가리킨다.
 *
 * ── 이벤트 (표준 어휘는 `done` 하나뿐이고 나머지는 이 facet 고유다)
 *   points-placed     payload 없음
 *                     두 무리가 제자리를 잡는다.
 *   candidates-drawn  { lines: { slope: number; intercept: number }[] }
 *                     후보 중심선이 그어진다. 전부 두 무리를 가른다.
 *   band-grow         target: index:<i>[]  (그 띠에 닿은 점)
 *                     { row: number; slope: number; intercept: number;
 *                       thickness: number; best: boolean }
 *                     띠가 0 에서 thickness 까지 벌어지다 멈춘다. row 는 두께
 *                     기록장의 몇째 줄인지.
 *   line-pivot        { slope: number; intercept: number }
 *                     띠가 접히고 선이 최적 기울기로 돈다.
 *   contacts-locked   target: index:<i>[]  (최적 띠에 닿은 점)
 *                     { slope: number; intercept: number }
 *                     닿은 점에서 중심선까지 수선이 내려온다.
 *   done              { row: number; thickness: number }
 *                     가장 두꺼운 줄이 답이다.
 *   rewind            payload 없음
 *                     되짚기 시작 — 화면을 처음 상태로 돌린다.
 *
 *   silent 는 쓰지 않는다. 일곱 모두 걸음 경계다.
 *
 * ── 화면 문안
 *   payload 에 문안을 싣지 않는다. 어느 이벤트가 무슨 말을 할지는 projector 가
 *   정하고 문안 자체는 `facet.ts` 의 `messages` 에 있다 (C10).
 *
 * ── 메트릭
 *   없다. 조각은 셀 것이 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type MarginPoint = {
  x: number;
  y: number;
  /** 이름표. 두 값만 등장한다 — 어느 쪽이 선 아래인지는 좌표가 정한다. */
  group: string;
};

export type WidestMarginData = {
  type: 'widest-margin';
  points: MarginPoint[];
  /** 견줄 후보 기울기. 무엇을 견줄지는 저작 결정이라 선언에 둔다. */
  candidateSlopes: number[];
  /** 걸음 간격 (S-piece). */
  stepMs: number;
};

/** 한 기울기에서 가장 두껍게 벌어진 띠. */
export type MarginBand = {
  slope: number;
  /** 띠 한가운데를 지나는 선의 높이. y = slope·x + intercept */
  intercept: number;
  /** 띠의 두께 (수직 거리). */
  thickness: number;
  /** 띠 가장자리에 닿은 점의 인덱스. */
  contacts: number[];
};

/** 두 점이 같은 가장자리에 있다고 볼 오차. 좌표는 사람이 적은 작은 수다. */
const EDGE_EPS = 1e-9;

/** 법선의 y 성분이 이보다 작으면 수직선이라 y = mx + b 로 적을 수 없다. */
const VERTICAL_EPS = 1e-12;

/**
 * 기울기 하나에서 가장 두꺼운 띠를 잰다.
 *
 * 선을 y = m·x + b 로 놓으면 점 (x, y) 가 선의 어느 쪽에 얼마나 있는지는
 * v = y − m·x 하나로 정해진다. 아래 무리의 최댓값과 위 무리의 최솟값 사이가
 * 비어 있는 만큼이 띠가 벌어질 수 있는 폭이고, 그것을 수직 거리로 고치면
 * √(m²+1) 로 나눈 값이다.
 *
 * @param lower 선 아래에 놓일 무리의 이름표.
 * @returns 그 배치로 갈리지 않으면 null.
 */
function bandWithLower(
  points: MarginPoint[],
  slope: number,
  lower: string,
): MarginBand | null {
  let lowerMax = Number.NEGATIVE_INFINITY;
  let upperMin = Number.POSITIVE_INFINITY;
  for (const p of points) {
    const v = p.y - slope * p.x;
    if (p.group === lower) {
      if (v > lowerMax) lowerMax = v;
    } else if (v < upperMin) {
      upperMin = v;
    }
  }
  if (!Number.isFinite(lowerMax) || !Number.isFinite(upperMin)) return null;
  if (upperMin - lowerMax <= EDGE_EPS) return null;

  const norm = Math.hypot(slope, 1);
  const contacts: number[] = [];
  points.forEach((p, i) => {
    const v = p.y - slope * p.x;
    const edge = p.group === lower ? lowerMax : upperMin;
    if (Math.abs(v - edge) < EDGE_EPS) contacts.push(i);
  });
  return {
    slope,
    intercept: (lowerMax + upperMin) / 2,
    thickness: (upperMin - lowerMax) / norm,
    contacts,
  };
}

/**
 * 기울기 하나에서 가장 두꺼운 띠. 어느 무리가 선 아래인지는 좌표가 정하므로
 * 양쪽을 다 재 보고 갈리는 쪽을 쓴다.
 */
export function widestBandFor(points: MarginPoint[], slope: number): MarginBand | null {
  if (points.length === 0) return null;
  const first = points[0];
  const below = bandWithLower(points, slope, first.group);
  if (below) return below;
  const other = points.find((p) => p.group !== first.group);
  if (other === undefined) return null;
  return bandWithLower(points, slope, other.group);
}

/**
 * 모든 기울기 가운데 띠가 가장 두꺼운 것.
 *
 * 최대 마진 선은 두 무리의 볼록껍질을 잇는 최단 선분에 수직이고, 그 선분은
 * 꼭짓점–꼭짓점이거나 꼭짓점–변이다. 그래서 후보 방향은 유한하다 — 점쌍을
 * 잇는 방향과 그 방향의 수직, 둘뿐이다. 기울기를 촘촘히 훑을 까닭이 없다.
 *
 * 수직선(x = c)은 후보에서 뺀다. 그림이 선을 y = m·x + b 로 그리므로 적을 수
 * 없는 답이다 — 두 무리의 x 범위가 겹치면 애초에 존재하지도 않는다.
 */
export function widestBand(points: MarginPoint[]): MarginBand | null {
  let best: MarginBand | null = null;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const a = points[i];
      const b = points[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      // 점쌍을 잇는 방향이 법선인 경우와, 그 점쌍이 껍질의 변인 경우.
      const normals: ReadonlyArray<readonly [number, number]> = [
        [dx, dy],
        [dy, -dx],
      ];
      for (const [nx, ny] of normals) {
        if (Math.abs(ny) < VERTICAL_EPS) continue;
        const band = widestBandFor(points, -nx / ny);
        if (band && (best === null || band.thickness > best.thickness)) best = band;
      }
    }
  }
  return best;
}

/** 띠에 닿은 점을 표준 식별자로 (C1). */
function contactTargets(band: MarginBand): string[] {
  return band.contacts.map((i) => `index:${i}`);
}

export async function widestMarginAlgorithm(
  base: FacetContext<WidestMarginData>,
): Promise<void> {
  const ctx = base as ReactiveContext<WidestMarginData>;
  const { points, candidateSlopes, stepMs } = ctx.data;

  // 후보가 하나라도 갈리지 않으면 "다 가르기는 한다" 는 전제가 무너져 물음이
  // 서지 않는다. 조용히 건너뛰지 않고 어느 기울기가 문제인지 말한다 (C6).
  const candidates = candidateSlopes.map((slope) => {
    const band = widestBandFor(points, slope);
    if (band === null) {
      throw new Error(`최대 마진: 기울기 ${slope} 는 두 무리를 가르지 못한다 — candidateSlopes 를 고쳐라`);
    }
    return band;
  });

  const found = widestBand(points);
  if (found === null) {
    throw new Error('최대 마진: 두 무리를 가르는 선이 없다 — initialData.points 를 확인해라');
  }
  const best: MarginBand = found;

  let manual = false;
  let freeGate = false;

  /** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false (C8). */
  async function gate(): Promise<boolean> {
    if (ctx.cancelled) return false;
    if (!manual) return ctx.sleep(stepMs);
    if (freeGate) {
      // 되감기 직후의 첫 문. 그냥 통과시켜야 첫 누름이 첫 걸음까지 간다.
      freeGate = false;
      return true;
    }
    for (;;) {
      if (ctx.cancelled) return false;
      let input: ReactiveInputEvent;
      try {
        input = await ctx.waitForInput();
      } catch {
        // 취소되면 waitForInput 이 reject 한다. 걸음을 끝내는 정상 경로다 (C6).
        return false;
      }
      if (input.type !== 'advance') continue;
      return !ctx.cancelled;
    }
  }

  /** 한 바퀴 전부. 끝까지 갔으면 true, 도중에 취소됐으면 false. */
  async function play(): Promise<boolean> {
    if (!(await gate())) return false;
    await ctx.emit({ type: 'points-placed' });

    if (!(await gate())) return false;
    await ctx.emit({
      type: 'candidates-drawn',
      payload: {
        lines: candidates.map((c) => ({ slope: c.slope, intercept: c.intercept })),
      },
    });

    for (let row = 0; row < candidates.length; row += 1) {
      if (!(await gate())) return false;
      const band = candidates[row];
      await ctx.emit({
        type: 'band-grow',
        target: contactTargets(band),
        payload: {
          row,
          slope: band.slope,
          intercept: band.intercept,
          thickness: band.thickness,
          best: false,
        },
      });
    }

    if (!(await gate())) return false;
    await ctx.emit({
      type: 'line-pivot',
      payload: { slope: best.slope, intercept: best.intercept },
    });

    if (!(await gate())) return false;
    await ctx.emit({
      type: 'band-grow',
      target: contactTargets(best),
      payload: {
        row: candidates.length,
        slope: best.slope,
        intercept: best.intercept,
        thickness: best.thickness,
        best: true,
      },
    });

    if (!(await gate())) return false;
    await ctx.emit({
      type: 'contacts-locked',
      target: contactTargets(best),
      payload: { slope: best.slope, intercept: best.intercept },
    });

    if (!(await gate())) return false;
    await ctx.emit({
      type: 'done',
      payload: { row: candidates.length, thickness: best.thickness },
    });
    return true;
  }

  if (!(await play())) return;

  // 자동 재생이 끝났다. 이제부터는 눌러서 되짚는다.
  manual = true;
  for (;;) {
    if (ctx.cancelled) return;
    let input: ReactiveInputEvent;
    try {
      input = await ctx.waitForInput();
    } catch {
      // 취소되면 waitForInput 이 reject 한다. 되짚기를 끝내는 정상 경로다 (C6).
      return;
    }
    if (ctx.cancelled) return;
    if (input.type !== 'advance') continue;
    freeGate = true;
    await ctx.emit({ type: 'rewind' });
    if (!(await play())) return;
  }
}
