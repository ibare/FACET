/**
 * one-way-edge — 방향 간선 조각 (piece).
 *
 * 주장 하나: **같은 선이라도 화살이 붙으면 되돌아오는 길이 사라진다.**
 * 논증은 "성한 것을 보인 뒤 손댄다" 순서다 — 무방향으로 걸어 전부 닿는 것을
 * 보이고, 같은 다섯 선에 방향을 붙이고, 다시 걸으면 한 정점이 남는다.
 *
 * 화면에 뜨는 수(닿은 정점 수 · 선 수 · 남은 정점)는 전부 이 파일이 구조에서
 * 셈한 값이다. 걸음표를 손으로 적은 배열은 없다 — 걸음은 BFS 순회의 결과다.
 *
 * ── 식별자
 *   node:<id>          정점 (S · A · B · T · C)
 *
 * ── 이벤트 (전부 리터럴 emit, silent 없음 — 모두 시각 변화가 있다)
 *
 *   mode-changed   payload: { mode: 'undirected' | 'directed'; source: string; lines: number }
 *                  그림 전체의 모드 전이. 'undirected' 는 두 차선 + 출발점 표시,
 *                  'directed' 는 각 선에서 한 차선이 떨어져 나가고 한 방향만 남는다.
 *
 *                  표준 `state-changed` 를 쓰지 않는다 — 그 어휘의 뜻은 "어떤 항목의
 *                  상태가 바뀌었다" 인데 여기서 바뀌는 것은 항목이 아니라 그림 전체라
 *                  `target` 에 적을 것이 없다(출발 정점을 적는 것은 편의일 뿐 사실이
 *                  아니다). 필드 이름도 `phase` 가 아니다 — 코드 패널의 `phase` 와
 *                  글자가 겹치면 뒤에 읽는 사람이 같은 것으로 본다 (C3).
 *
 *   walk-step      target: [node:<from>, node:<to>]
 *                  payload: { from: string; to: string }
 *                  from 에서 to 로 한 걸음 건너가 to 를 처음 밟는다.
 *
 *   walk-done      payload: { mode: 'undirected' | 'directed'; source: string;
 *                             reached: number; total: number }
 *                  한 차례 답사가 끝났을 때의 셈.
 *
 *   walk-blocked   target: node:<node>
 *                  payload: { node: string; from: string[] }
 *                  닿지 못한 정점으로 들어가려던 시도가 되튄다. from 은 그 정점과
 *                  선을 나눠 갖지만 화살이 반대라 들어갈 수 없는 정점들.
 *
 *   push-out       target: node:<node>
 *                  payload: { node: string }
 *                  닿지 못한 정점이 고리 밖으로 밀려난다.
 *
 *   done           payload: { source: string; reached: number; total: number;
 *                             stranded: string[] }
 *
 *   rewind         payload: { source: string }
 *                  자동 재생이 끝난 뒤 advance 를 처음 눌렀을 때. 화면을 처음으로
 *                  되돌린다 (그리고 곧바로 첫 걸음까지 보인다).
 *
 * ── 메트릭: 없다. 조각은 셀 것이 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/**
 * 선 하나. `dir` 는 2단계에서 이 선에 붙을 화살의 방향이다 —
 * 'uv' 면 u→v, 'vu' 면 v→u. 무방향 단계에서는 쓰이지 않는다.
 */
export type OneWayEdgeLine = { u: string; v: string; dir: 'uv' | 'vu' };

export type OneWayEdgeData = {
  type: 'one-way-edge';
  nodes: string[];
  edges: OneWayEdgeLine[];
  source: string;
  stepMs: number;
};

type Hop = { from: string; to: string };

/** 방향을 붙였을 때 이 선이 어디서 어디로 향하는가. */
function directedEnds(line: OneWayEdgeLine): Hop {
  return line.dir === 'uv' ? { from: line.u, to: line.v } : { from: line.v, to: line.u };
}

/**
 * 정점 `at` 에서 이 선을 타고 갈 수 있는 반대편. 갈 수 없으면 null.
 * directed 면 화살 방향을 따를 때만 통한다.
 */
function crossing(line: OneWayEdgeLine, at: string, directed: boolean): string | null {
  if (directed) {
    const ends = directedEnds(line);
    return ends.from === at ? ends.to : null;
  }
  if (line.u === at) return line.v;
  if (line.v === at) return line.u;
  return null;
}

/** 출발점에서의 너비 우선 답사. 처음 밟는 순간만 걸음으로 남는다. */
function walkFrom(
  edges: OneWayEdgeLine[],
  source: string,
  directed: boolean,
): { hops: Hop[]; reached: string[] } {
  const reached = [source];
  const seen = new Set([source]);
  const hops: Hop[] = [];
  const queue = [source];
  while (queue.length > 0) {
    const at = queue.shift();
    if (at === undefined) break;
    for (const line of edges) {
      const next = crossing(line, at, directed);
      if (next === null || seen.has(next)) continue;
      seen.add(next);
      reached.push(next);
      queue.push(next);
      hops.push({ from: at, to: next });
    }
  }
  return { hops, reached };
}

/** `node` 와 선을 나눠 갖지만 화살이 반대라 들어올 수 없는, 이미 닿은 정점들. */
function blockedNeighbors(
  edges: OneWayEdgeLine[],
  node: string,
  reached: string[],
): string[] {
  const out: string[] = [];
  for (const line of edges) {
    const other = crossing(line, node, false);
    if (other === null || !reached.includes(other)) continue;
    if (!out.includes(other)) out.push(other);
  }
  return out;
}

export async function oneWayEdgeAlgorithm(ctx: FacetContext<OneWayEdgeData>): Promise<void> {
  const r = ctx as ReactiveContext<OneWayEdgeData>;
  const { nodes, edges, source, stepMs } = r.data;

  /** 자동 재생이 끝난 뒤에는 걸음마다 advance 를 기다린다. */
  let manual = false;
  /**
   * 되감기 직후의 첫 문은 그냥 통과시킨다 — 처음 누른 advance 가 되감기만 하고
   * 멈추면 눌러도 반응이 없는 것으로 읽힌다 (S-piece).
   */
  let passFirstGate = false;

  async function gate(): Promise<void> {
    if (r.cancelled) throw new Error('cancelled');
    if (!manual) {
      await r.sleep(stepMs);
      if (r.cancelled) throw new Error('cancelled');
      return;
    }
    if (passFirstGate) {
      passFirstGate = false;
      return;
    }
    for (;;) {
      if (r.cancelled) throw new Error('cancelled');
      const input = await r.waitForInput();
      if (input.type === 'advance') return;
    }
  }

  /**
   * 셈이 나온 뒤 읽을 틈. 손으로 짚는 중이면 시간은 읽는 사람이 쥐고 있으므로
   * 두지 않는다.
   */
  async function beat(): Promise<void> {
    if (manual || r.cancelled) return;
    await r.sleep(stepMs);
  }

  async function play(): Promise<void> {
    // 1) 성한 것 — 화살이 없는 다섯 선.
    await gate();
    await r.emit({
      type: 'mode-changed',
      payload: { mode: 'undirected', source, lines: edges.length },
    });

    const open = walkFrom(edges, source, false);
    for (const hop of open.hops) {
      if (r.cancelled) return;
      await gate();
      await r.emit({
        type: 'walk-step',
        target: [`node:${hop.from}`, `node:${hop.to}`],
        payload: { from: hop.from, to: hop.to },
      });
    }
    await gate();
    await r.emit({
      type: 'walk-done',
      payload: {
        mode: 'undirected',
        source,
        reached: open.reached.length,
        total: nodes.length,
      },
    });
    await beat();

    // 2) 손댄다 — 같은 선에 화살이 붙고 반대 차선이 끊긴다.
    await gate();
    await r.emit({
      type: 'mode-changed',
      payload: { mode: 'directed', source, lines: edges.length },
    });

    // 3) 다시 걷는다.
    const closed = walkFrom(edges, source, true);
    for (const hop of closed.hops) {
      if (r.cancelled) return;
      await gate();
      await r.emit({
        type: 'walk-step',
        target: [`node:${hop.from}`, `node:${hop.to}`],
        payload: { from: hop.from, to: hop.to },
      });
    }

    const stranded = nodes.filter((n) => !closed.reached.includes(n));
    for (const node of stranded) {
      if (r.cancelled) return;
      await gate();
      await r.emit({
        type: 'walk-blocked',
        target: `node:${node}`,
        payload: { node, from: blockedNeighbors(edges, node, closed.reached) },
      });
      await gate();
      await r.emit({ type: 'push-out', target: `node:${node}`, payload: { node } });
    }

    await gate();
    await r.emit({
      type: 'done',
      payload: {
        source,
        reached: closed.reached.length,
        total: nodes.length,
        stranded,
      },
    });
  }

  await play();

  // 자동 재생이 끝났다. advance 를 누르면 처음으로 되감고 한 걸음씩 짚는다.
  for (;;) {
    if (r.cancelled) return;
    const input = await r.waitForInput();
    if (input.type !== 'advance') continue;
    manual = true;
    passFirstGate = true;
    await r.emit({ type: 'rewind', payload: { source } });
    await play();
    manual = false;
  }
}
