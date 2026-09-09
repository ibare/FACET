/**
 * relaxShorterPath — 완화(relaxation) 조각의 algorithm.
 *
 * 이 조각이 답하는 질문:
 *   "더 짧은 길을 찾았을 때 정점이 이고 있던 수는 어떻게 되는가?"
 *
 * 동사는 **내려간다**. 적어 둔 거리를 지우고 더 낮은 수로 다시 적는 일이
 * 이 조각의 전부이며, 한 번도 올라가는 일이 없다.
 *
 * ── 진행 (reactive)
 *
 * mount 즉시 자동 재생하고, 끝나면 `waitForInput` 루프에서 `advance` 를 받는다.
 * 자동 재생 뒤 처음 누르는 `advance` 는 되감고(첫 `rewind`) 첫 걸음까지 보인다
 * (S-piece). 걸음 간격은 `ctx.data.stepMs` — 저작 선언이다.
 *
 * ── 걸음의 출처
 *
 * 걸음표를 손으로 적지 않는다. 정점과 간선 목록에서 "지금까지 적힌 수가 가장
 * 작은 정점부터 편다" 를 그대로 돌린 결과가 걸음이다 (C2). 화면에 뜨는 수는
 * 전부 이 순회가 셈한 값이며 상수로 박은 것이 하나도 없다.
 *
 * ── 이벤트 목록 (표준은 `done` 뿐, 나머지는 이 facet 고유)
 *
 * | type      | target             | payload                                                    | silent |
 * |-----------|--------------------|------------------------------------------------------------|--------|
 * | `settle`  | `node:<v>`         | `{ vertex: string; dist: number }`                           | no |
 * | `write`   | `edge:<from>-<to>` | `{ vertex: string; from: string; weight: number; value: number }` | no |
 * | `probe`   | `edge:<from>-<to>` | `{ from: string; to: string; weight: number; candidate: number; current: number }` | no |
 * | `descend` | `node:<v>`         | `{ vertex: string; fromValue: number; toValue: number }`      | no |
 * | `keep`    | `node:<v>`         | `{ vertex: string; candidate: number; current: number }`      | no |
 * | `rewind`  | —                  | —                                                            | no |
 * | `done`    | —                  | —                                                            | no |
 *
 * `write` 와 `probe` 가 갈리는 자리가 이 조각의 요지다. 적힌 수가 없으면 견줄
 * 것이 없으므로 `probe` 를 내지 않고 곧장 `write` 다 — 처음 적는 일과 이미 적힌
 * 수가 내려가는 일은 서로 다른 사건이며, 화면에서도 다르게 보여야 한다.
 *
 * silent 이벤트는 없다. 일곱 모두 화면이 바뀌는 걸음이다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 방향 간선. 무게는 음이 아닌 정수. */
export type RelaxEdge = { from: string; to: string; weight: number };

export type RelaxShorterPathData = {
  type: 'relax-shorter-path';
  /** 화면의 열 순서이기도 하다. */
  vertices: string[];
  edges: RelaxEdge[];
  /** 처음에 0 이 적혀 있는 정점. 나머지는 아직 모름. */
  source: string;
  /** 세로 눈금의 위 끝. 재생 중 나오는 어떤 수보다 커야 한다. */
  scaleMax: number;
  /** 걸음 간격(ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

type Mode = 'auto' | 'manual';

/**
 * 한 회차를 재생한다.
 *
 * `gate()` 는 emit **앞**에 서는 문이다. auto 면 stepMs 를 자고, manual 이면
 * `advance` 를 기다린다. 되감기 직후의 첫 문만 그냥 통과시켜, 자동 재생을 마친
 * 뒤 처음 누르는 `advance` 가 "되감기 + 첫 걸음" 이 되게 한다 (S-piece).
 *
 * @returns 끝까지 재생했으면 true, 취소로 끊겼으면 false.
 */
async function playOnce(ctx: ReactiveContext<RelaxShorterPathData>, mode: Mode): Promise<boolean> {
  const { vertices, edges, source, stepMs } = ctx.data;

  let firstGateOpen = mode === 'manual';
  const gate = async (): Promise<boolean> => {
    if (ctx.cancelled) return false;
    if (mode === 'auto') return ctx.sleep(stepMs);
    if (firstGateOpen) {
      firstGateOpen = false;
      return true;
    }
    for (;;) {
      const input = await ctx.waitForInput();
      if (ctx.cancelled) return false;
      if (input.type === 'advance') return true;
    }
  };

  /** 적어 둔 거리. null 은 "아직 모름". */
  const written = new Map<string, number | null>();
  for (const v of vertices) written.set(v, v === source ? 0 : null);
  const opened = new Set<string>();

  for (;;) {
    // 지금까지 적힌 수가 가장 작은 정점부터 편다.
    let pick: string | null = null;
    let smallest = Number.POSITIVE_INFINITY;
    for (const v of vertices) {
      const d = written.get(v);
      if (opened.has(v) || d === null || d === undefined) continue;
      if (d < smallest) {
        smallest = d;
        pick = v;
      }
    }
    if (pick === null) break;
    opened.add(pick);

    // 나가는 간선이 없으면 펼 것이 없다 — 걸음을 내지 않는다. 확정됐다는 표시는
    // 마지막 `done` 이 한꺼번에 한다.
    const outgoing = edges.filter((e) => e.from === pick);
    if (outgoing.length === 0) continue;

    if (!(await gate())) return false;
    await ctx.emit({ type: 'settle', target: `node:${pick}`, payload: { vertex: pick, dist: smallest } });

    for (const edge of outgoing) {
      const candidate = smallest + edge.weight;
      const current = written.get(edge.to) ?? null;

      if (current === null) {
        // 적힌 수가 없으면 견줄 것이 없다 — 비교 걸음 없이 그대로 적는다.
        written.set(edge.to, candidate);
        if (!(await gate())) return false;
        await ctx.emit({
          type: 'write',
          target: `edge:${edge.from}-${edge.to}`,
          payload: { vertex: edge.to, from: edge.from, weight: edge.weight, value: candidate },
        });
        continue;
      }

      if (!(await gate())) return false;
      await ctx.emit({
        type: 'probe',
        target: `edge:${edge.from}-${edge.to}`,
        payload: { from: edge.from, to: edge.to, weight: edge.weight, candidate, current },
      });

      if (candidate < current) {
        written.set(edge.to, candidate);
        if (!(await gate())) return false;
        await ctx.emit({
          type: 'descend',
          target: `node:${edge.to}`,
          payload: { vertex: edge.to, fromValue: current, toValue: candidate },
        });
      } else {
        if (!(await gate())) return false;
        await ctx.emit({
          type: 'keep',
          target: `node:${edge.to}`,
          payload: { vertex: edge.to, candidate, current },
        });
      }
    }
  }

  if (!(await gate())) return false;
  await ctx.emit({ type: 'done' });
  return true;
}

export const relaxShorterPathAlgorithm = async (
  ctx: FacetContext<RelaxShorterPathData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<RelaxShorterPathData>;

  await playOnce(rc, 'auto');

  // 자동 재생이 끝난 뒤 — 곱씹으며 읽고 싶은 사람을 위해 한 걸음씩 다시 편다.
  while (!rc.cancelled) {
    const input = await rc.waitForInput();
    if (rc.cancelled) return;
    if (input.type !== 'advance') continue;
    await rc.emit({ type: 'rewind' });
    await playOnce(rc, 'manual');
  }
};
