/**
 * support-vectors-only — 경계에 닿은 것만 선을 정한다.
 *
 * 최대 마진 선을 좌표에서 직접 푼다. 무게(법선) 방향을 0.05도 간격으로 훑으면서
 * 두 무리의 투영이 가장 크게 벌어지는 방향을 고르고, 그 틈의 한가운데를 선으로
 * 삼는다. **어느 점이 선을 정했는지도 그 계산에서 나온다** — 선언에 적어 두지
 * 않는다. 조각이 답할 질문이 바로 그것이기 때문이다.
 *
 * 손질 셋은 `initialData.edits` 가 정한다. 그중 첫째(`dropUntouched`)는 버릴
 * 점을 스스로 셈한다 — 어느 여섯을 버릴지는 저작이 아니라 풀이의 결과다.
 *
 * ── 이벤트 (전부 facet 고유. silent 없음 — 걸음마다 화면이 바뀐다)
 *
 *   points-placed    { points: Pt[] }
 *                    점을 놓는다. Pt = { x: number; y: number; group: 'A' | 'B' }.
 *
 *   boundary-solved  { slope: number; intercept: number; lower: number;
 *                      upper: number; margin: number; supports: number[];
 *                      verdict: 'first' | 'same' | 'moved' }
 *                    훑어 얻은 선. lower/upper 는 띠 두 가장자리의 y 절편,
 *                    margin 은 가장자리 사이 수직 거리, supports 는 가장자리에
 *                    닿은 점의 첨자, verdict 는 처음 선과 견준 결과.
 *
 *   supports-marked  { indices: number[]; restCount: number }
 *                    선을 정한 점과 그러지 못한 점의 수.
 *
 *   points-dropped   { indices: number[] }
 *                    가장자리에 닿지 않은 점을 버린다.
 *
 *   points-restored  { points: Pt[] }
 *                    앞 손질을 되돌린다. 손질끼리 겹치면 대비가 성립하지 않는다.
 *
 *   point-moved      { index: number; toX: number; toY: number; steps: number;
 *                      wasSupport: boolean }
 *                    점 하나를 옮긴다. steps 는 옮긴 거리(칸), wasSupport 는
 *                    그 점이 처음 선을 정했는지.
 *
 *   rewind           {}
 *                    자동 재생이 끝난 뒤 처음 누르는 advance 가 되감는다.
 *
 *   done             { supports: number[] }
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SupportVectorsOnlyPoint = { x: number; y: number; group: 'A' | 'B' };

export type SupportVectorsOnlyEdit =
  | { kind: 'dropUntouched' }
  | { kind: 'move'; index: number; toX: number; toY: number };

export type SupportVectorsOnlyData = {
  type: 'support-vectors-only';
  points: SupportVectorsOnlyPoint[];
  edits: SupportVectorsOnlyEdit[];
  stepMs: number;
};

/** 훑는 촘촘함. 0~180도를 이 수로 나눈다 (3600 이면 0.05도 간격). */
const SWEEP_STEPS = 3600;
/** 가장자리에 닿았다고 볼 오차. 격자 위에서 풀리므로 실제 오차는 1e-15 언저리다. */
const TOUCH_EPS = 1e-6;
/** 두 선을 같은 선으로 볼 오차. */
const SAME_EPS = 1e-6;

type Solution = {
  slope: number;
  intercept: number;
  lower: number;
  upper: number;
  margin: number;
  supports: number[];
};

/**
 * 방향을 훑어 최대 마진 선을 찾는다. 두 무리가 어느 방향으로도 갈라지지 않으면
 * null.
 *
 * i 를 1 부터 세는 것은 세로선(방향 (1,0))을 빼기 위해서다 — 세로선은
 * y = mx + b 로 적을 수 없다. 이 자료에서는 두 무리의 x 범위가 통째로 겹쳐
 * 세로선으로는 애초에 갈라지지 않으므로, 빼도 답이 달라지지 않는다.
 *
 * ctx 를 받지 않는 순수 계산이라 안쪽 루프에 문(gate)도 취소 검사도 없다
 * (C8 의 "순수 계산 헬퍼" 예외). 걸음은 이 함수를 부르는 쪽이 짓는다.
 */
function solveMaxMargin(
  points: readonly SupportVectorsOnlyPoint[],
  alive: readonly boolean[],
): Solution | null {
  let best: { wx: number; wy: number; edgeA: number; edgeB: number; gap: number } | null = null;

  for (let i = 1; i < SWEEP_STEPS; i += 1) {
    const theta = (Math.PI * i) / SWEEP_STEPS;
    const wx = Math.cos(theta);
    const wy = Math.sin(theta);

    let aMin = Infinity;
    let aMax = -Infinity;
    let bMin = Infinity;
    let bMax = -Infinity;
    for (let k = 0; k < points.length; k += 1) {
      if (!alive[k]) continue;
      const p = points[k];
      if (p === undefined) continue;
      const proj = wx * p.x + wy * p.y;
      if (p.group === 'A') {
        if (proj < aMin) aMin = proj;
        if (proj > aMax) aMax = proj;
      } else {
        if (proj < bMin) bMin = proj;
        if (proj > bMax) bMax = proj;
      }
    }
    if (aMax === -Infinity || bMax === -Infinity) continue;

    const gapAbove = bMin - aMax; // A 가 낮은 쪽
    const gapBelow = aMin - bMax; // B 가 낮은 쪽
    const gap = Math.max(gapAbove, gapBelow);
    if (gap <= 0) continue;
    if (best !== null && gap <= best.gap) continue;

    best =
      gapAbove >= gapBelow
        ? { wx, wy, edgeA: aMax, edgeB: bMin, gap: gapAbove }
        : { wx, wy, edgeA: aMin, edgeB: bMax, gap: gapBelow };
  }

  if (best === null) return null;

  const { wx, wy, edgeA, edgeB, gap } = best;
  const interceptA = edgeA / wy;
  const interceptB = edgeB / wy;
  const supports: number[] = [];
  for (let k = 0; k < points.length; k += 1) {
    if (!alive[k]) continue;
    const p = points[k];
    if (p === undefined) continue;
    const proj = wx * p.x + wy * p.y;
    const edge = p.group === 'A' ? edgeA : edgeB;
    if (Math.abs(proj - edge) < TOUCH_EPS) supports.push(k);
  }

  return {
    slope: -wx / wy,
    intercept: (interceptA + interceptB) / 2,
    lower: Math.min(interceptA, interceptB),
    upper: Math.max(interceptA, interceptB),
    margin: gap,
    supports,
  };
}

function isSameLine(a: Solution, b: Solution): boolean {
  return (
    Math.abs(a.slope - b.slope) < SAME_EPS &&
    Math.abs(a.intercept - b.intercept) < SAME_EPS &&
    Math.abs(a.margin - b.margin) < SAME_EPS
  );
}

function copyPoints(points: readonly SupportVectorsOnlyPoint[]): SupportVectorsOnlyPoint[] {
  return points.map((p) => ({ x: p.x, y: p.y, group: p.group }));
}

export async function supportVectorsOnlyAlgorithm(
  ctx: FacetContext<SupportVectorsOnlyData>,
): Promise<void> {
  const rc = ctx as ReactiveContext<SupportVectorsOnlyData>;
  const origin = copyPoints(rc.data.points);
  const edits = rc.data.edits;
  const stepMs = rc.data.stepMs;
  let manual = false;

  /** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false. */
  async function gate(): Promise<boolean> {
    if (rc.cancelled) return false;
    if (!manual) return rc.sleep(stepMs);
    for (;;) {
      if (rc.cancelled) return false;
      const input = await rc.waitForInput();
      if (input.type !== 'advance') continue;
      return !rc.cancelled;
    }
  }

  /**
   * 처음부터 끝까지 한 번 보인다. 취소되면 false.
   *
   * 첫 걸음(`points-placed`)에는 문이 없다 — mount 하자마자 화면이 비어 있으면 안
   * 되고, 되감은 직후의 첫 누름도 이 한 걸음까지 와야 하기 때문이다. 그래서
   * S-piece 의 "되감기 직후의 첫 문만 그냥 통과시킨다" 장치가 여기서는 필요 없다.
   */
  async function play(): Promise<boolean> {
    const work = copyPoints(origin);
    const alive = origin.map(() => true);

    await rc.emit({ type: 'points-placed', payload: { points: copyPoints(work) } });

    if (!(await gate())) return false;
    const first = solveMaxMargin(work, alive);
    if (first === null) throw new Error('최대 마진 선을 찾지 못했다: 두 무리가 어느 방향으로도 갈라지지 않는다');
    await rc.emit({ type: 'boundary-solved', payload: { ...first, verdict: 'first' } });

    if (!(await gate())) return false;
    await rc.emit({
      type: 'supports-marked',
      payload: { indices: [...first.supports], restCount: work.length - first.supports.length },
    });

    let latest = first;
    let edited = false;
    for (const edit of edits) {
      if (!(await gate())) return false;
      if (edited) {
        for (let k = 0; k < work.length; k += 1) {
          const p = origin[k];
          if (p !== undefined) work[k] = { x: p.x, y: p.y, group: p.group };
          alive[k] = true;
        }
        await rc.emit({ type: 'points-restored', payload: { points: copyPoints(work) } });
      }
      edited = true;

      if (edit.kind === 'dropUntouched') {
        // 손질 앞에서 늘 되돌리므로 지금 선은 언제나 처음 선이다.
        const dropped: number[] = [];
        for (let k = 0; k < work.length; k += 1) {
          if (first.supports.includes(k)) continue;
          alive[k] = false;
          dropped.push(k);
        }
        await rc.emit({ type: 'points-dropped', payload: { indices: dropped } });
      } else {
        const from = work[edit.index];
        if (from === undefined) throw new Error(`옮길 점이 없다: 첨자 ${edit.index}`);
        work[edit.index] = { x: edit.toX, y: edit.toY, group: from.group };
        await rc.emit({
          type: 'point-moved',
          payload: {
            index: edit.index,
            toX: edit.toX,
            toY: edit.toY,
            steps: Math.hypot(edit.toX - from.x, edit.toY - from.y),
            wasSupport: first.supports.includes(edit.index),
          },
        });
      }

      if (!(await gate())) return false;
      const again = solveMaxMargin(work, alive);
      if (again === null) throw new Error('손질 뒤 최대 마진 선을 찾지 못했다: 두 무리가 겹친다');
      latest = again;
      await rc.emit({
        type: 'boundary-solved',
        payload: { ...again, verdict: isSameLine(again, first) ? 'same' : 'moved' },
      });
    }

    if (!(await gate())) return false;
    await rc.emit({ type: 'done', payload: { supports: [...latest.supports] } });
    return true;
  }

  if (!(await play())) return;

  for (;;) {
    if (rc.cancelled) return;
    const input = await rc.waitForInput();
    if (rc.cancelled) return;
    if (input.type !== 'advance') continue;
    manual = true;
    await rc.emit({ type: 'rewind' });
    if (!(await play())) return;
  }
}
