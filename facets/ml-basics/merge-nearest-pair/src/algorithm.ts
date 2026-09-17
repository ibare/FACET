/**
 * mergeNearestPair — 병합 군집화. 가장 가까운 둘을 합쳐 그 거리만큼 올려 건다.
 *
 * 모두가 저 혼자 한 무리인 채로 시작한다. 무리쌍의 거리를 전부 재어 가장 짧은
 * 것을 합치고, 합친 자리를 그 거리만큼의 높이에 건다. 하나가 남을 때까지.
 * 무리 수를 미리 정하지 않으므로, 여덟에서 하나까지가 한 그림에 다 들어온다.
 *
 * ── 이벤트 (`done` 만 표준 어휘, 나머지는 이 facet 고유 — C2)
 *   `merge-rise`  한 걸음 = 한 번의 합침. silent 아님.
 *     {
 *       links: { from: string; to: string }[]
 *                                        이 걸음에 잰 무리쌍 전부. 각 항목은 그
 *                                        쌍의 거리를 실현한 점 두 개의 이름이다
 *                                        (단일 연결이라 거리는 늘 점 두 개가 낸다)
 *       pickFrom: string                 그중 가장 짧았던 쌍의 한쪽 점
 *       pickTo: string                   같은 쌍의 다른 쪽 점
 *     }
 *     싣는 것은 **판정 둘**뿐이다 — 무엇을 재었고 그중 무엇이 가장 가까웠나.
 *     합친 차례 · 무리 이름 · 걸린 높이 · 남은 무리 수는 전부 구조에서 세지므로
 *     장면이 셈한다 (`scene.ts`). 무리에 이름을 붙이던 코드가 여기서 죽으면서
 *     `Cluster` 의 `id` 필드가 통째로 없어졌다 — 같은 규칙이 두 곳에 적혀 있던
 *     자리였다.
 *   `done`        하나만 남았다. payload 없음. silent 아님.
 *   `rewind`      되감아 처음으로 (한 걸음씩 다시 보려는 참이다).
 *                 payload 없음. silent 아님.
 *
 * ── 메트릭
 *   없다. 조각은 셀 것을 두지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type MergePoint = { id: string; x: number; y: number };

export type MergeNearestPairData = {
  type: 'merge-nearest-pair';
  /** 무리로 묶을 점들. 자리와 축척은 stage 가 셈한다 (S-piece). */
  points: MergePoint[];
  /** 걸음 간격 (ms). 읽을 시간을 주는 저작 결정이라 선언에 둔다. */
  stepMs: number;
};

/**
 * 지금 서 있는 무리 하나.
 *
 * 이름을 두지 않는다 — 무리에 이름을 붙이는 일은 자취를 쥔 장면의 몫이고, 여기서
 * 한 번 더 붙이면 같은 규칙이 두 곳에 적힌다 (프로토콜 4 절).
 */
type Cluster = { members: MergePoint[] };

/** 두 무리 사이의 거리 — 가장 가까운 두 점 사이의 거리다 (단일 연결). */
function singleLink(
  a: Cluster,
  b: Cluster,
): { d: number; from: string; to: string } {
  let d = Number.POSITIVE_INFINITY;
  let from = '';
  let to = '';
  for (const p of a.members) {
    for (const q of b.members) {
      const gap = Math.hypot(p.x - q.x, p.y - q.y);
      if (gap < d) {
        d = gap;
        from = p.id;
        to = q.id;
      }
    }
  }
  return { d, from, to };
}

export const mergeNearestPairAlgorithm = async (
  ctx: FacetContext<MergeNearestPairData>,
): Promise<void> => {
  const rctx = ctx as ReactiveContext<MergeNearestPairData>;
  const points = Array.isArray(ctx.data.points) ? ctx.data.points : [];
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : 850;

  /** 자동 재생을 마쳤는가. 마친 뒤로는 걸음마다 `advance` 를 기다린다. */
  let manual = false;
  /** 되감기 직후의 첫 문은 그냥 통과한다 — 첫 걸음까지 보여야 하므로 (S-piece). */
  let freeGate = false;

  /** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false (C8). */
  async function gate(): Promise<boolean> {
    if (ctx.cancelled) return false;
    if (!manual) return rctx.sleep(stepMs);
    if (freeGate) {
      freeGate = false;
      return true;
    }
    for (;;) {
      if (ctx.cancelled) return false;
      const input = await rctx.waitForInput();
      if (input.type !== 'advance') continue;
      return !ctx.cancelled;
    }
  }

  if (points.length < 2) return;

  try {
    for (;;) {
      const clusters: Cluster[] = points.map((p) => ({ members: [p] }));

      while (clusters.length > 1) {
        if (!(await gate())) return;

        // 남은 무리쌍을 전부 잰다. 한 걸음 안의 셈이라 문을 둘 자리가 아니다 —
        // 이 되풀이는 걸음이 아니라 그 걸음의 재료다 (C8).
        const links: { from: string; to: string }[] = [];
        let best = { d: Number.POSITIVE_INFINITY, i: 0, j: 1, from: '', to: '' };
        for (let i = 0; i < clusters.length; i += 1) {
          for (let j = i + 1; j < clusters.length; j += 1) {
            const a = clusters[i];
            const b = clusters[j];
            if (!a || !b) continue;
            const link = singleLink(a, b);
            links.push({ from: link.from, to: link.to });
            if (link.d < best.d) best = { d: link.d, i, j, from: link.from, to: link.to };
          }
        }

        const left = clusters[best.i];
        const right = clusters[best.j];
        if (!left || !right) return;

        clusters.splice(best.j, 1);
        clusters.splice(best.i, 1);
        clusters.push({ members: [...left.members, ...right.members] });

        await ctx.emit({
          type: 'merge-rise',
          payload: { links, pickFrom: best.from, pickTo: best.to },
        });
      }

      if (!(await gate())) return;
      await ctx.emit({ type: 'done' });

      // 자동 재생이 끝났다. 여기서부터는 눌러야 나아간다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (input.type !== 'advance') continue;
        break;
      }
      if (ctx.cancelled) return;
      manual = true;
      freeGate = true;
      await ctx.emit({ type: 'rewind' });
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6).
    // 그 밖의 오류는 그대로 올려 러너가 console.error 로 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
};
