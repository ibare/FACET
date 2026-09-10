/**
 * 가장 넓게 퍼진 방향 — 축을 돌려 퍼짐을 재고, 가장 넓어지는 자리에서 멈춘다.
 *
 * 점 무리의 가운데를 지나는 축 하나를 돌린다. 점을 그 축에 내려 찍으면 자국이
 * 생기고, 자국이 가운데에서 얼마나 벌어져 있는지(제곱해 평균낸 값)가 그 방향의
 * 퍼짐이다. 축을 돌리는 동안 그 값이 오르내리며, 가장 높아지는 자리가 답이다.
 *
 * 곁들여 드러나는 것 — 어느 각도에서 재든 그 방향과 직각 방향의 퍼짐을 더하면
 * 늘 같다. 한쪽이 늘면 다른 쪽이 준다. 그래서 걸음마다 `across`(직각 방향의
 * 퍼짐)와 `total`(둘의 합)을 함께 보낸다. 합은 가정하지 않고 직각 방향을 실제로
 * 다시 재어 얻는다 — 그래야 화면이 항등식을 주장하는 것이 아니라 보여 준다.
 *
 * ── 이벤트 (전부 이 facet 고유. silent 인 것은 없다)
 *
 *   center-found  { cx: number; cy: number }
 *       축이 지날 가운데(좌표의 평균)를 잡았다.
 *
 *   axis-turn     { angleDeg, variance, across, total }
 *       축을 `angleDeg`(가로를 0도로 한 반시계 각도) 로 돌려 재었다.
 *       `variance` 그 방향의 퍼짐 · `across` 직각 방향의 퍼짐 · `total` 둘의 합.
 *
 *   narrow        { angleDeg, variance, across, total,
 *                   curveAngles: number[]; curveValues: number[] }
 *       성긴 훑기에서 가장 높았던 자리 둘레를 촘촘히 다시 재어 봉우리를 짚었다.
 *       `curveAngles` / `curveValues` 는 같은 길이의 평행 배열 — 촘촘한 곡선.
 *
 *   done          { angleDeg, variance, across, total, share: number }
 *       멈춘 자리. `share` 는 가장 넓은 쪽이 합에서 차지하는 몫(백분율).
 *
 *   rewind        {}
 *       한 걸음씩 되짚기 위해 처음으로 되돌린다.
 *
 * 메트릭은 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DirectionOfMostSpreadData = {
  type: string;
  /** 점 무리. `[x, y]` 쌍의 배열 — 데이터 좌표이지 화면 좌표가 아니다. */
  points: number[][];
  /** 걸음 간격 (S-piece). */
  stepMs: number;
};

type Point = { x: number; y: number };

/** 성긴 훑기의 각도 간격. 이 간격으로 0도부터 180도 직전까지 돈다. */
const COARSE_STEP_DEG = 15;

/** `narrow` 가 보내는 촘촘한 곡선의 각도 간격. */
const FINE_STEP_DEG = 2;

/** 봉우리를 좁혀 들어가는 삼분 탐색의 되풀이 수. (2/3)^40 이면 충분히 붙는다. */
const REFINE_ROUNDS = 40;

const DEG = Math.PI / 180;

function readPoints(data: DirectionOfMostSpreadData): Point[] {
  const rows = Array.isArray(data.points) ? data.points : [];
  const out: Point[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || typeof row[0] !== 'number' || typeof row[1] !== 'number') continue;
    out.push({ x: row[0], y: row[1] });
  }
  if (out.length === 0) throw new Error('점 무리가 비었다: direction-of-most-spread 의 initialData.points');
  return out;
}

/** 한 방향으로 내려 찍은 자국의 분산. 가운데에서의 거리를 제곱해 평균낸다. */
function spreadAlong(points: Point[], cx: number, cy: number, deg: number): number {
  const ux = Math.cos(deg * DEG);
  const uy = Math.sin(deg * DEG);
  let sum = 0;
  for (const p of points) {
    const t = (p.x - cx) * ux + (p.y - cy) * uy;
    sum += t * t;
  }
  return sum / points.length;
}

/** 봉우리를 품은 구간을 삼분 탐색으로 좁힌다. */
function refinePeak(points: Point[], cx: number, cy: number, lo: number, hi: number): number {
  let a = lo;
  let b = hi;
  for (let i = 0; i < REFINE_ROUNDS; i += 1) {
    const m1 = a + (b - a) / 3;
    const m2 = b - (b - a) / 3;
    if (spreadAlong(points, cx, cy, m1) < spreadAlong(points, cx, cy, m2)) a = m1;
    else b = m2;
  }
  return (a + b) / 2;
}

export const directionOfMostSpreadAlgorithm = async (
  ctx: FacetContext<DirectionOfMostSpreadData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<DirectionOfMostSpreadData>;
  const points = readPoints(ctx.data);
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : 700;

  const cx = points.reduce((a, p) => a + p.x, 0) / points.length;
  const cy = points.reduce((a, p) => a + p.y, 0) / points.length;

  const reading = (deg: number): { angleDeg: number; variance: number; across: number; total: number } => {
    const variance = spreadAlong(points, cx, cy, deg);
    const across = spreadAlong(points, cx, cy, deg + 90);
    return { angleDeg: deg, variance, across, total: variance + across };
  };

  /** 성긴 훑기가 짚을 각도. 사람이 적은 표가 아니라 간격에서 나온 순회다. */
  const coarseAngles: number[] = [];
  for (let deg = 0; deg < 180; deg += COARSE_STEP_DEG) coarseAngles.push(deg);

  let manual = false;

  /** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false (C8). */
  const gate = async (): Promise<boolean> => {
    if (rc.cancelled) return false;
    if (!manual) return rc.sleep(stepMs);
    for (;;) {
      if (rc.cancelled) return false;
      const input = await rc.waitForInput();
      if (input.type !== 'advance') continue;
      return !rc.cancelled;
    }
  };

  try {
    for (;;) {
      if (rc.cancelled) return;
      // 마운트 직후(그리고 되감은 직후)의 첫 걸음은 문을 지나지 않는다 (S-piece).
      // 그래서 되감기 뒤 첫 `advance` 한 번에 rewind + 이 걸음, 둘이 나간다.
      await rc.emit({ type: 'center-found', payload: { cx, cy } });

      let bestDeg = coarseAngles[0] ?? 0;
      let bestSpread = -1;
      for (const deg of coarseAngles) {
        if (!(await gate())) return;
        const r = reading(deg);
        if (r.variance > bestSpread) {
          bestSpread = r.variance;
          bestDeg = deg;
        }
        await rc.emit({ type: 'axis-turn', payload: r });
      }

      // 성긴 훑기에서 가장 높았던 자리의 좌우 한 칸이 봉우리를 품는다.
      const peakDeg = refinePeak(points, cx, cy, bestDeg - COARSE_STEP_DEG, bestDeg + COARSE_STEP_DEG);
      const curveAngles: number[] = [];
      const curveValues: number[] = [];
      for (let deg = 0; deg <= 180; deg += FINE_STEP_DEG) {
        curveAngles.push(deg);
        curveValues.push(spreadAlong(points, cx, cy, deg));
      }
      const peak = reading(peakDeg);

      if (!(await gate())) return;
      await rc.emit({ type: 'narrow', payload: { ...peak, curveAngles, curveValues } });

      if (!(await gate())) return;
      await rc.emit({
        type: 'done',
        payload: { ...peak, share: (peak.variance / peak.total) * 100 },
      });

      // 자동 재생이 끝났다. 여기서부터는 누를 때마다 한 걸음씩 (S-piece).
      manual = true;
      for (;;) {
        if (rc.cancelled) return;
        const input = await rc.waitForInput();
        if (rc.cancelled) return;
        if (input.type === 'advance') break;
      }
      await rc.emit({ type: 'rewind' });
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6).
    // 그 밖의 오류는 그대로 올려 러너가 console.error 로 드러내게 둔다.
    if (!rc.cancelled) throw err;
  }
};
