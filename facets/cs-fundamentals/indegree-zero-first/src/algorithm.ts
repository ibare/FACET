/**
 * indegree-zero-first — 진입 차수 0 인 것부터 꺼내는 조각(piece) algorithm.
 *
 * ── 이 조각이 말하는 것
 * 들어오는 화살이 하나도 없는 정점만 지금 꺼낼 수 있다. 하나를 꺼내면 그것이
 * 걸어 두었던 화살이 떨어져 나가고, 그 화살을 이고 있던 정점들의 수가 하나씩
 * 줄어든다. 그러다 0 이 된 것이 뒤따라 떨어진다.
 *
 * ── 파생값은 전부 구조에서 센다
 * 진입 차수도, 지금 꺼낼 수 있는 집합도, 나오는 순서도 `nodes` / `edges` 를
 * 훑어 계산한다. 손으로 적은 표를 두지 않는다 (S-piece).
 * 꺼낼 수 있는 것이 둘 이상이면 알파벳 순으로 고른다 — `ready` 를 문자열
 * 기본 정렬로 유지하는 것이 그 규칙이다.
 *
 * ── 식별자
 *   node:<id>            정점
 *   edge:<from>-<to>     방향 간선
 *
 * ── 이벤트
 * | type              | target           | payload                                            | silent |
 * |-------------------|------------------|----------------------------------------------------|--------|
 * | indegrees-counted | —                | { counts: { id: string; count: number }[] }         | no     |
 * | layer-discovered  | node:<id>[]      | { distance: number; nodes: string[] }               | no     |
 * | dequeue           | node:<id>        | { id: string; slot: number }                        | no     |
 * | arrows-dropped    | edge:<f>-<t>[]   | { from: string; drops: { to; was; now }[] }         | no     |
 * | rewind            | —                | —                                                   | no     |
 * | done              | —                | { order: string[] }                                 | no     |
 *
 * `layer-discovered` 는 표준 어휘를 그대로 쓴다. 같은 순간에 동시에 꺼낼 수 있게
 * 된 집합이며 `distance` 는 그 집합이 드러난 라운드다 (0 = 아직 아무것도 꺼내기
 * 전). C2 가 이 용도를 명시한다 — "위상 정렬의 같은 in-degree 0 집합 배치".
 *
 * `arrows-dropped` 는 한 정점이 걸어 두었던 화살을 한 걸음에 묶어 떨군다.
 * 정점이 빠지면 그 정점에서 나가는 화살은 동시에 사라지므로, 하나씩 나누어
 * 발신하면 없는 순서를 지어내는 것이 된다.
 *
 * ── 메트릭
 * 없다. 조각은 셀 것이 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type IndegreeEdge = { from: string; to: string };

export type IndegreeZeroFirstData = {
  type: 'indegree-zero-first';
  /** 정점 식별자. */
  nodes: string[];
  /** 방향 간선. from 에서 to 로 들어간다. */
  edges: IndegreeEdge[];
  /** 걸음 간격 (ms). 저작 결정이므로 선언에 둔다 (S-piece). */
  stepMs: number;
};

const DEFAULT_STEP_MS = 900;

/** 한 걸음을 열어 주는 문. false 를 돌려주면 그 자리에서 멈춘다. */
type Gate = () => Promise<boolean>;

/** 간선 목록을 훑어 각 정점이 이고 있는 화살의 수를 센다. */
function countIndegrees(data: IndegreeZeroFirstData): Map<string, number> {
  const indeg = new Map<string, number>();
  for (const id of data.nodes) indeg.set(id, 0);
  for (const e of data.edges) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  return indeg;
}

/** 한 번의 재생. gate 가 자동 재생(sleep)일 수도, 한 걸음씩(waitForInput)일 수도 있다. */
async function play(ctx: ReactiveContext<IndegreeZeroFirstData>, gate: Gate): Promise<void> {
  const data = ctx.data;
  const indeg = countIndegrees(data);

  // 1. 각 정점이 이고 있는 수를 띄운다. 세는 일 자체는 한 순간이므로 한 걸음이다.
  if (!(await gate())) return;
  await ctx.emit({
    type: 'indegrees-counted',
    payload: { counts: data.nodes.map((id) => ({ id, count: indeg.get(id) ?? 0 })) },
  });

  // 2. 처음부터 0 인 것들. 여럿이면 알파벳 순으로 줄을 세운다.
  const ready = data.nodes.filter((id) => (indeg.get(id) ?? 0) === 0).sort();
  if (!(await gate())) return;
  await ctx.emit({
    type: 'layer-discovered',
    target: ready.map((id) => `node:${id}`),
    payload: { distance: 0, nodes: [...ready] },
  });

  const order: string[] = [];
  let round = 1;

  while (ready.length > 0) {
    const id = ready.shift() as string;

    // 3. 꺼낸다 — 이고 있는 수가 0 인 것만 여기 올 수 있다.
    if (!(await gate())) return;
    await ctx.emit({ type: 'dequeue', target: `node:${id}`, payload: { id, slot: order.length } });
    order.push(id);

    const outs = data.edges
      .filter((e) => e.from === id)
      .sort((x, y) => (x.to < y.to ? -1 : x.to > y.to ? 1 : 0));

    if (outs.length > 0) {
      // 4. 빠진 정점이 걸어 두었던 화살이 떨어지고, 그것을 이고 있던 수가 준다.
      const drops = outs.map((e) => {
        const was = indeg.get(e.to) ?? 0;
        const now = was - 1;
        indeg.set(e.to, now);
        return { to: e.to, was, now };
      });
      if (!(await gate())) return;
      await ctx.emit({
        type: 'arrows-dropped',
        target: outs.map((e) => `edge:${e.from}-${e.to}`),
        payload: { from: id, drops },
      });

      // 5. 그래서 새로 0 이 된 것들이 뒤따라 떨어질 차례가 된다.
      const newlyZero = drops.filter((d) => d.now === 0).map((d) => d.to).sort();
      if (newlyZero.length > 0) {
        if (!(await gate())) return;
        await ctx.emit({
          type: 'layer-discovered',
          target: newlyZero.map((n) => `node:${n}`),
          payload: { distance: round, nodes: newlyZero },
        });
        for (const n of newlyZero) ready.push(n);
        ready.sort();
      }
    }

    round++;
  }

  if (!(await gate())) return;
  await ctx.emit({ type: 'done', payload: { order } });
}

/** 다음 입력을 기다린다. 취소로 깨어나면 null. */
async function waitInput(
  ctx: ReactiveContext<IndegreeZeroFirstData>,
): Promise<ReactiveInputEvent | null> {
  try {
    return await ctx.waitForInput();
  } catch {
    return null;
  }
}

export const indegreeZeroFirstAlgorithm = async (
  ctx: FacetContext<IndegreeZeroFirstData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<IndegreeZeroFirstData>;
  const stepMs = typeof rc.data.stepMs === 'number' ? rc.data.stepMs : DEFAULT_STEP_MS;

  // 자동 재생. mount 즉시 스스로 시작해 할 말을 마친다.
  await play(rc, () => rc.sleep(stepMs));
  if (rc.cancelled) return;

  // 재생 중에 눌린 것은 흘려보낸다. 그래야 "재생이 끝난 뒤 처음 누르는 advance" 의
  // 뜻이 한 갈래로 남는다 (S-piece).
  while (rc.pollInput() !== null) {
    /* drain */
  }

  for (;;) {
    if ((await waitInput(rc)) === null) return;

    // 되감고 곧바로 첫 걸음까지 보인다. 되감기만 하고 멈추면 눌러도 반응이 없는
    // 것으로 읽힌다 (S-piece).
    await rc.emit({ type: 'rewind' });
    if (rc.cancelled) return;

    let firstGate = true;
    await play(rc, async () => {
      if (firstGate) {
        firstGate = false;
        return !rc.cancelled;
      }
      return (await waitInput(rc)) !== null;
    });
    if (rc.cancelled) return;
  }
};
