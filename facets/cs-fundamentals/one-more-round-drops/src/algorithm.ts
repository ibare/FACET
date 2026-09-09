/**
 * one-more-round-drops — 다 끝났어야 할 바퀴에서 수가 또 줄면, 돌수록 짧아지는
 * 고리가 있다는 뜻이다.
 *
 * 조각(piece). 주장 하나만 말한다 — **멎지 않는다.**
 * 정점이 n 개면 최단 거리는 n−1 바퀴 안에 정해진다. 그 바퀴를 다 돌고 한 번 더
 * 돌렸을 때 또 내려가면, 그 뒤로도 영영 내려간다. 화면은 몇 바퀴를 더 보이고
 * 멈추지만 (`initialData.rounds`), 값은 바퀴마다 같은 폭으로 계속 작아진다.
 *
 * ── 식별자 (C1)
 *   `edge:<from>-<to>`   방향 간선 하나. `target` 으로만 쓴다.
 *
 * ── 이벤트 (전부 facet 고유 확장, C2). silent 인 것은 없다.
 *
 *   graph-ready
 *     target  없음
 *     payload { nodes: string[];
 *               edges: { from: string; to: string; w: number }[];
 *               source: string;
 *               entries: { node: string; value: number | null; delta: null }[];
 *               vMax: number; vMin: number }         // 세로 눈금의 위아래 끝
 *     value 가 null 이면 아직 닿지 못한 정점(∞)이다.
 *
 *   round-dropped
 *     target  이 바퀴에 값을 낮춘 간선들 (`edge:A-B` 배열)
 *     payload { round: number;
 *               beyond: boolean;                     // bound 를 넘긴 바퀴인가
 *               entries: { node: string; value: number | null; delta: number | null }[] }
 *     delta 는 이 바퀴에 내려간 폭. 안 움직였거나 ∞ 에서 처음 정해졌으면 null.
 *
 *   bound-marked
 *     target  없음
 *     payload { round: number; entries: { node, value, delta }[] }
 *     n−1 바퀴를 마친 자리. 여기가 바닥이어야 한다.
 *
 *   keeps-falling
 *     target  마지막 바퀴에도 다시 걸린 간선들 (= 음수 고리)
 *     payload 없음. 할 말은 target 이 다 한다.
 *
 *   rewind
 *     target/payload 없음. 되감아 처음 화면으로 돌린다 (advance 첫 누름).
 *
 * ── 메트릭 없음 (조각은 ctx.metric 을 부르지 않는다, S-piece).
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type OneMoreRoundDropsEdge = { from: string; to: string; w: number };

export type OneMoreRoundDropsData = {
  type: 'one-more-round-drops';
  /** 정점 이름. 화면 오른쪽의 세로 궤도 하나가 정점 하나다. */
  nodes: string[];
  /** 방향 간선. w 는 무게이며 음수를 허용한다. */
  edges: OneMoreRoundDropsEdge[];
  /** 출발 정점. 이 정점만 0 에서 시작하고 나머지는 ∞ 다. */
  source: string;
  /** 몇 바퀴까지 보이고 멈출지. 저작 결정이다. */
  rounds: number;
  /** 걸음 간격 (S-piece). */
  stepMs: number;
};

/**
 * 발신 상한. 선언이 잘못 들어와도 화면이 끝없이 돌지는 않게 한다 (C8).
 * "멎지 않는다" 는 주장이지 재생 길이가 아니다.
 */
const MAX_ROUNDS = 12;

/** 한 정점의 지금 값. value 가 null 이면 ∞. */
export type OneMoreRoundDropsEntry = {
  node: string;
  value: number | null;
  delta: number | null;
};

type RoundSnapshot = {
  round: number;
  entries: OneMoreRoundDropsEntry[];
  /** 이 바퀴에 값을 낮춘 간선의 target 식별자. */
  relaxed: string[];
};

export type OneMoreRoundDropsRun = {
  /** 실제로 굴린 바퀴 수 (상한으로 잘린 뒤). */
  rounds: number;
  /** n−1. 여기까지면 다 정해졌어야 한다. */
  bound: number;
  initial: OneMoreRoundDropsEntry[];
  snapshots: RoundSnapshot[];
  vMax: number;
  vMin: number;
};

function edgeTarget(edge: OneMoreRoundDropsEdge): string {
  return `edge:${edge.from}-${edge.to}`;
}

/**
 * 바퀴마다 모든 간선을 한 번씩 완화한 결과를 미리 셈한다 (순수 함수, C8 예외).
 *
 * 화면에 뜰 수는 전부 여기서 나온다 — 눈금의 위아래 끝(vMax/vMin)까지 포함해서다.
 * 세로 자리가 곧 값이므로 눈금을 먼저 정하지 않으면 그림을 그릴 수 없고, 그 값을
 * 손으로 적으면 화면이 거짓을 말하게 된다 (S-piece).
 */
export function simulateOneMoreRoundDrops(data: OneMoreRoundDropsData): OneMoreRoundDropsRun {
  const nodes = data.nodes;
  const edges = data.edges;
  const rounds = Math.max(1, Math.min(MAX_ROUNDS, Math.floor(data.rounds)));
  const bound = Math.max(1, nodes.length - 1);

  const dist = new Map<string, number | null>();
  for (const node of nodes) dist.set(node, node === data.source ? 0 : null);

  const finite: number[] = [];
  const initial: OneMoreRoundDropsEntry[] = nodes.map((node) => {
    const value = dist.get(node) ?? null;
    if (value !== null) finite.push(value);
    return { node, value, delta: null };
  });

  const snapshots: RoundSnapshot[] = [];
  for (let round = 1; round <= rounds; round++) {
    const before = new Map(dist);
    const relaxed: string[] = [];
    for (const edge of edges) {
      const from = dist.get(edge.from) ?? null;
      if (from === null) continue;
      const candidate = from + edge.w;
      const to = dist.get(edge.to) ?? null;
      if (to === null || candidate < to) {
        dist.set(edge.to, candidate);
        relaxed.push(edgeTarget(edge));
      }
    }
    const entries: OneMoreRoundDropsEntry[] = nodes.map((node) => {
      const value = dist.get(node) ?? null;
      const was = before.get(node) ?? null;
      if (value !== null) finite.push(value);
      const delta = value !== null && was !== null && value !== was ? value - was : null;
      return { node, value, delta };
    });
    snapshots.push({ round, entries, relaxed });
  }

  return {
    rounds,
    bound,
    initial,
    snapshots,
    vMax: finite.length > 0 ? Math.max(...finite) : 0,
    vMin: finite.length > 0 ? Math.min(...finite) : 0,
  };
}

/**
 * 걸음 사이의 문(gate). true 면 다음 걸음을 발신하고, false 면 접는다.
 *
 * 자동 재생은 `ctx.sleep`, 한 걸음씩 짚기는 `waitForInput` 으로 문을 열 뿐
 * 걸음 자체는 한 벌이다 — 두 벌로 나누면 순서가 갈린다.
 */
type Gate = () => Promise<boolean>;

function autoGate(ctx: ReactiveContext<OneMoreRoundDropsData>, stepMs: number): Gate {
  // 첫 문은 그냥 통과한다. 여기서 재우면 mount 직후 잠깐 빈 캔버스가 보인다.
  let first = true;
  return async () => {
    if (first) {
      first = false;
      return !ctx.cancelled;
    }
    return ctx.sleep(stepMs);
  };
}

function advanceGate(ctx: ReactiveContext<OneMoreRoundDropsData>): Gate {
  // 되감기 직후의 첫 문도 그냥 통과시킨다 — 누르자마자 첫 걸음이 보여야
  // 누른 것이 먹혔다고 읽힌다 (S-piece).
  let first = true;
  return async () => {
    if (first) {
      first = false;
      return !ctx.cancelled;
    }
    for (;;) {
      let input: ReactiveInputEvent;
      try {
        input = await ctx.waitForInput();
      } catch {
        // 기다리는 중에 러너가 접었다 (reset / destroy). 조용히 끝낸다 (C6).
        return false;
      }
      if (ctx.cancelled) return false;
      // 지금은 advance 뿐이지만, 위젯 입력이 하나라도 붙으면 아무 dispatch 나
      // 걸음으로 세게 된다. 종류를 본다.
      if (input.type === 'advance') return true;
    }
  };
}

async function playRun(ctx: ReactiveContext<OneMoreRoundDropsData>, gate: Gate): Promise<void> {
  const data = ctx.data;
  const run = simulateOneMoreRoundDrops(data);

  if (!(await gate())) return;
  await ctx.emit({
    type: 'graph-ready',
    payload: {
      nodes: data.nodes,
      edges: data.edges,
      source: data.source,
      entries: run.initial,
      vMax: run.vMax,
      vMin: run.vMin,
    },
  });

  let lastRelaxed: string[] = [];
  for (const snapshot of run.snapshots) {
    if (ctx.cancelled) return;

    if (!(await gate())) return;
    await ctx.emit({
      type: 'round-dropped',
      target: snapshot.relaxed,
      payload: {
        round: snapshot.round,
        beyond: snapshot.round > run.bound,
        entries: snapshot.entries,
      },
    });
    lastRelaxed = snapshot.relaxed;

    if (snapshot.round === run.bound) {
      if (!(await gate())) return;
      await ctx.emit({
        type: 'bound-marked',
        payload: { round: run.bound, entries: snapshot.entries },
      });
    }
  }

  if (ctx.cancelled) return;
  if (!(await gate())) return;
  await ctx.emit({ type: 'keeps-falling', target: lastRelaxed });
}

export const oneMoreRoundDropsAlgorithm = async (
  ctx: FacetContext<OneMoreRoundDropsData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<OneMoreRoundDropsData>;
  const stepMs = typeof rc.data.stepMs === 'number' ? rc.data.stepMs : 800;

  await playRun(rc, autoGate(rc, stepMs));

  // 자동 재생이 끝난 뒤에도 한 걸음씩 다시 짚어 볼 수 있다 (CONTROL.advance).
  while (!rc.cancelled) {
    let input: ReactiveInputEvent;
    try {
      input = await rc.waitForInput();
    } catch {
      // 기다리는 중에 러너가 접었다 (reset / destroy). 조용히 끝낸다 (C6).
      return;
    }
    if (rc.cancelled) return;
    if (input.type !== 'advance') continue;

    await rc.emit({ type: 'rewind' });
    await playRun(rc, advanceGate(rc));
  }
};
