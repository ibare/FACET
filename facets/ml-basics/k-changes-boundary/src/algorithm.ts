/**
 * k 값의 영향 — 물음점을 둘러싼 테두리가 자라며 안에 드는 이웃이 늘고,
 * 어느 순간 다수가 바뀌어 답이 뒤집힌다.
 *
 * 같은 점, 같은 데이터, 같은 방법인데 k 하나로 답이 둘이 된다. 뒤집히는
 * 순간이 이 조각의 주인공이다.
 *
 * ── 식별자
 *   index:<i>   이름표 있는 점. `initialData.points` 의 인덱스.
 *
 * ── 이벤트 (표준 어휘는 `done` 뿐, 나머지는 이 facet 고유)
 *   question-posed     target 없음                payload {}
 *       가운데 물음점을 세운다. 아직 이름표가 없다.
 *   ring-grow          target 없음                payload { k: number; radius: number }
 *       테두리가 가장 가까운 k 개를 담는 크기까지 자란다. radius 는 데이터
 *       공간의 길이이며 화면 길이로 바꾸는 것은 stage 의 몫이다.
 *   neighbor-captured  target `index:<i>`          payload { label: string }
 *       테두리에 새로 든 이웃 하나가 자기 이름표에 표를 던진다.
 *   tally-settled      target 없음                payload
 *       { k: number; labels: string[]; counts: number[]; verdict: string; previous: string | null }
 *       표를 세어 답을 정한다. labels 와 counts 는 같은 자리끼리 짝이고,
 *       previous 는 **앞선 k 의 답**이다 (첫 k 에서는 null). 그것과 verdict 이
 *       다르면 뒤집힌 것이다 — 판정은 표현 계층이 한다.
 *   rewind             target 없음                payload {}
 *       처음으로 되감는다. 자동 재생이 끝난 뒤 첫 `advance` 에서만 나간다.
 *   done               target `index:<i>`          payload { nearest: string; verdict: string }
 *       한 바퀴가 끝났다. target 은 가장 가까운 이웃이고 nearest 는 그 이름표,
 *       verdict 은 마지막 답이다 — 둘이 다른 것이 이 조각의 맺음이다.
 *
 * silent 는 쓰지 않는다 — 여섯 모두 화면을 바꾼다.
 *
 * ── 셈은 전부 좌표에서 나온다
 * 거리 · 순위 · 표 · 테두리 반지름은 `points` 와 `query` 로부터 이 파일이
 * 셈한다. 선언에 박아 둔 파생값은 없다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LabeledPoint = { x: number; y: number; label: string };

export type KChangesBoundaryData = {
  type: string;
  /** 이름표가 없는 물음점. */
  query: { x: number; y: number };
  /** 이름표 있는 점 열. */
  points: LabeledPoint[];
  /** 차례로 보여 줄 k 값. */
  ks: number[];
  /** 걸음 간격 (ms). 읽을 시간을 주는 저작 결정이라 선언에 둔다 (S-piece). */
  stepMs: number;
};

type Neighbor = { index: number; label: string; distance: number };

const FALLBACK_STEP_MS = 900;

/** 물음점에서 가까운 순. 거리가 같으면 먼저 적힌 점이 앞선다. */
function rankNeighbors(data: KChangesBoundaryData): Neighbor[] {
  const ranked = data.points.map((p, index) => ({
    index,
    label: p.label,
    distance: Math.hypot(p.x - data.query.x, p.y - data.query.y),
  }));
  ranked.sort((a, b) => (a.distance === b.distance ? a.index - b.index : a.distance - b.distance));
  return ranked;
}

/** 이름표가 처음 나타난 차례. 표를 세는 자리 순서가 여기서 정해진다. */
function labelOrder(points: LabeledPoint[]): string[] {
  const seen: string[] = [];
  for (const p of points) if (!seen.includes(p.label)) seen.push(p.label);
  return seen;
}

/**
 * k 번째 이웃은 담고 k+1 번째는 담지 않는 테두리의 반지름.
 * 두 거리의 한가운데를 잡아, 테두리가 점 위에 걸쳐 보이지 않게 한다.
 */
function radiusFor(ranked: Neighbor[], k: number): number {
  const inner = ranked[k - 1].distance;
  if (k >= ranked.length) return inner * 1.06;
  return (inner + ranked[k].distance) / 2;
}

/** 표가 가장 많은 이름표. 같으면 그중 가장 가까운 이웃의 것을 따른다. */
function verdictOf(near: Neighbor[], labels: string[], counts: number[]): string {
  let best = 0;
  for (let i = 1; i < counts.length; i += 1) if (counts[i] > counts[best]) best = i;
  const tied = counts.filter((c) => c === counts[best]).length > 1;
  return tied ? near[0].label : labels[best];
}

export async function kChangesBoundary(ctx: FacetContext<KChangesBoundaryData>): Promise<void> {
  const rc = ctx as ReactiveContext<KChangesBoundaryData>;
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : FALLBACK_STEP_MS;

  /** 자동 재생을 마쳤는가. 마친 뒤로는 `advance` 하나에 한 걸음이다. */
  let manual = false;

  const gate = async (): Promise<boolean> => {
    if (ctx.cancelled) return false;
    if (!manual) return rc.sleep(stepMs);
    for (;;) {
      if (ctx.cancelled) return false;
      const input = await rc.waitForInput();
      if (input.type === 'advance') return !ctx.cancelled;
    }
  };

  const playOnce = async (): Promise<void> => {
    const ranked = rankNeighbors(ctx.data);
    if (ranked.length === 0) return;
    const labels = labelOrder(ctx.data.points);

    // 물음을 세우는 첫 걸음에는 문을 두지 않는다. 자동 재생은 마운트하자마자
    // 말을 시작해야 하고, 되감은 뒤 첫 `advance` 는 이 한 걸음까지 가야 한다
    // (되감기만 하면 눌러도 반응이 없는 것으로 읽힌다 — S-piece).
    await ctx.emit({ type: 'question-posed', payload: {} });

    let shown = 0;
    /** 앞선 k 의 답. 아직 아무것도 세지 않았으면 null 이라 뒤집힘이 아니다. */
    let previous: string | null = null;
    for (const rawK of ctx.data.ks) {
      const k = Math.max(1, Math.min(ranked.length, Math.floor(rawK)));
      if (!(await gate())) return;
      await ctx.emit({ type: 'ring-grow', payload: { k, radius: radiusFor(ranked, k) } });

      for (let i = shown; i < k; i += 1) {
        // 이 루프에는 문이 없다 — 이웃이 한 걸음 안에 함께 담기는 것이 k 의
        // 뜻이라서다. 그래서 취소 검사를 여기서 직접 진다 (C8).
        if (ctx.cancelled) return;
        const neighbor = ranked[i];
        await ctx.emit({
          type: 'neighbor-captured',
          target: `index:${neighbor.index}`,
          payload: { label: neighbor.label },
        });
      }
      shown = k;

      const near = ranked.slice(0, k);
      const counts = labels.map((label) => near.filter((n) => n.label === label).length);
      const verdict = verdictOf(near, labels, counts);
      await ctx.emit({
        type: 'tally-settled',
        payload: { k, labels, counts, verdict, previous },
      });
      previous = verdict;
    }

    if (!(await gate())) return;
    await ctx.emit({
      type: 'done',
      target: `index:${ranked[0].index}`,
      payload: { nearest: ranked[0].label, verdict: previous ?? ranked[0].label },
    });
  };

  for (;;) {
    await playOnce();
    if (ctx.cancelled) return;
    manual = true;
    for (;;) {
      if (ctx.cancelled) return;
      const input = await rc.waitForInput();
      if (input.type === 'advance') break;
    }
    if (ctx.cancelled) return;
    await ctx.emit({ type: 'rewind', payload: {} });
  }
}
