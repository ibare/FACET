/**
 * Raft — 표를 모으는 것도 사본을 모으는 것도 전체 노드 수의 과반이 문턱이다.
 *
 * 한 판 = 선출 줄 → 쓰기 줄. 손잡이 둘(노드 수 · 멈춘 노드 수)을 받아 판을 다시 돈다.
 *
 * ## 규약 (사양 그대로 — 하나라도 다르면 다른 수가 나온다)
 * - 노드는 `nodes` 의 앞 n 개. S1 이 먼저 깨어나는 후보이자 리더 (타이머는 셈하지 않는다)
 * - 과반 = n // 2 + 1 — **살아 있는 수가 아니라 전체 n** 에서 셈한다
 * - 멈춤은 번호가 큰 노드부터 — n 개 중 f 개가 멈추면 앞의 n − f 개가 살아 있다. f = n 이면 S1 까지 멈춘다
 * - S1 은 제 한 표 · 제 사본 하나를 먼저 센다. 팔로워 응답은 제 왕복 ms(`rtt`, S2 … 차례) 에 닿는다
 *   (선출 줄은 후보가 된 때부터, 쓰기 줄은 쓰기가 닿은 때부터 각각 0 ms). 멈춘 노드는 답하지 않는다
 * - 과반에 닿는 순간 리더 · 확정. 선출과 쓰기는 같은 셈 `reachMajority` 를 쓴다 (IR 과 같은 함수)
 * - RequestVote · AppendEntries 는 앞의 n − 1 팔로워 모두에게 보낸다 (후보는 누가 멈췄는지 모른다)
 * - 동률: 왕복 ms 가 모두 달라 같은 시각에 닿는 응답이 없다 — 차례는 `rtt` 의 차례 그대로
 *
 * ## 이벤트 (silent 가 아닌 것은 걸음 하나씩 — 뒤에 sleep)
 * - `round`       { n, nodes: string[], down: string[], stopped, majority, tolerance, term, rtt: number[],
 *                   thresholdMs, thresholdNode, thresholdAlive: boolean, command }        걸음 0
 * - `no-candidate`{ votes, n }                                         깨어날 노드가 없다 (끝)
 * - `candidate`   { node, term, votes, n, requested: string[] }         후보 · 표 1
 * - `response`    { lane: 'vote' | 'copy', from, ms, count, n, majority, reached: boolean, leader, term }
 * - `overflow`    { lane: 'vote' | 'copy', from: string[], ms: number[], count, n }   과반 뒤 응답 묶음
 * - `no-majority` { votes, n, majority }                                과반 못 닿음 (끝)
 * - `write`       { node, command, index, term, count, n }              쓰기가 S1 로그 칸에
 * - `done`        { leader, electMs, commitMs, count, n, missing: string[] }   끝
 * - `phase`       { phase } — silent
 *
 * ## phase 어휘 (irs.ts 와 같다)
 * `init` (판 머리 · 후보 · 쓰기 걸음) · `count` (과반 전 응답) · `majority` (과반에 닿는 응답) · `no-majority` (못 닿는 끝).
 * 넘치는 응답 · 끝 걸음은 phase 를 새로 보내지 않는다.
 *
 * ## 계기
 * - `majority` — 과반 (n // 2 + 1)
 * - `live-nodes` — 살아 있는 노드 수 (n − f)
 * - `committed-writes` — 확정된 쓰기 (0 / 1). 판 머리에서 0, 확정 걸음에서 1
 * 판마다 지금 값을 들고 차이만 보낸다. 첫 판에는 차이가 0 이어도 보낸다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RaftData = {
  type: 'raft';
  stepMs: number;
  /** 노드 식별자 — 노드 수 n 이면 앞의 n 개 */
  nodes: string[];
  /** S1 ↔ S2 … 왕복 ms (빠른 차례) */
  rtt: number[];
  /** 처음 term */
  term: number;
  /** 쓰기 명령 (자료) */
  command: string;
  nodesLadder: number[];
  stoppedLadder: number[];
  nodesStart: number;
  stoppedStart: number;
};

/** IR `reachMajority` 와 같은 셈. 과반에 닿은 시각 ms, 못 닿으면 −1. */
export function reachMajority(n: number, stopped: number, rtt: number[]): number {
  const majority = Math.floor(n / 2) + 1;
  const alive = n - stopped;
  let got = 0;
  if (alive > 0) got = 1;
  for (let i = 0; i < alive - 1; i++) {
    got += 1;
    if (got === majority) {
      const ms = rtt[i];
      if (ms === undefined) throw new Error(`raft: 왕복 ms 칸 ${i} 이 없다`);
      return ms;
    }
  }
  return -1;
}

/** 한 판의 셈 — 걸음 모형과 검사가 함께 쓴다. */
export type RaftRound = {
  n: number;
  stopped: number;
  ids: string[];
  majority: number;
  alive: number;
  down: string[];
  liveFollowers: string[];
  rtt: number[];
  electMs: number;
  commitMs: number;
};

export function raftRound(data: RaftData, n: number, stopped: number): RaftRound {
  if (!data.nodesLadder.includes(n)) throw new Error(`raft: 노드 수 ${n} 은 사다리 밖이다`);
  if (!data.stoppedLadder.includes(stopped)) throw new Error(`raft: 멈춘 수 ${stopped} 은 사다리 밖이다`);
  if (stopped > n) throw new Error(`raft: 멈춘 수 ${stopped} 이 노드 수 ${n} 보다 크다`);
  if (data.nodes.length < n) throw new Error(`raft: 노드 식별자가 ${n} 개보다 적다`);
  if (data.rtt.length < n - 1) throw new Error(`raft: 왕복 ms 가 ${n - 1} 개보다 적다`);
  const ids = data.nodes.slice(0, n);
  const alive = n - stopped;
  const rtt = data.rtt.slice(0, n - 1);
  return {
    n,
    stopped,
    ids,
    majority: Math.floor(n / 2) + 1,
    alive,
    down: ids.slice(alive),
    liveFollowers: alive > 0 ? ids.slice(1, alive) : [],
    rtt,
    electMs: reachMajority(n, stopped, rtt),
    commitMs: reachMajority(n, stopped, rtt),
  };
}

function at<T>(list: T[], i: number, what: string): T {
  const v = list[i];
  if (v === undefined) throw new Error(`raft: ${what} 칸 ${i} 이 없다`);
  return v;
}

export async function raftAlgorithm(baseCtx: FacetContext<RaftData>): Promise<void> {
  const ctx = baseCtx as ReactiveContext<RaftData>;
  const data = ctx.data;
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const pause = () => ctx.sleep(data.stepMs);

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number) => {
    const prev = shown.get(name);
    ctx.metric(name, value - (prev ?? 0));
    shown.set(name, value);
  };

  /** 한 판. 취소되면 false. */
  const play = async (n: number, stopped: number): Promise<boolean> => {
    const r = raftRound(data, n, stopped);
    const leader = at(r.ids, 0, '노드');
    const thresholdIndex = r.majority - 2;
    const thresholdAlive = r.majority <= r.alive;

    setMetric('majority', r.majority);
    setMetric('live-nodes', r.alive);
    setMetric('committed-writes', 0);
    // 걸음 0 이 보이는 과반 · 살아 있는 수는 IR init 줄이 셈하는 값 — 앞 판의 결론 phase 를 덮는다
    await phase('init');
    await ctx.emit({
      type: 'round',
      payload: {
        n,
        nodes: r.ids,
        down: r.down,
        stopped,
        majority: r.majority,
        tolerance: n - r.majority,
        term: data.term,
        rtt: r.rtt,
        thresholdMs: at(r.rtt, thresholdIndex, '왕복 ms'),
        thresholdNode: at(r.ids, r.majority - 1, '노드'),
        thresholdAlive,
        command: data.command,
      },
    });
    if (!(await pause())) return false;

    if (r.alive === 0) {
      await phase('no-majority');
      await ctx.emit({ type: 'no-candidate', payload: { votes: 0, n } });
      return pause();
    }

    const term = data.term + 1;
    await phase('init');
    await ctx.emit({
      type: 'candidate',
      payload: { node: leader, term, votes: 1, n, requested: r.ids.slice(1) },
    });
    if (!(await pause())) return false;

    // 두 줄이 같은 셈 — 표 줄과 사본 줄
    const collect = async (lane: 'vote' | 'copy', expectMs: number): Promise<'cancel' | 'short' | number> => {
      let got = 1;
      for (let i = 0; i < r.liveFollowers.length; i++) {
        if (ctx.cancelled) return 'cancel';
        got += 1;
        const from = at(r.liveFollowers, i, '살아 있는 팔로워');
        const ms = at(r.rtt, i, '왕복 ms');
        const reached = got === r.majority;
        if (reached) {
          if (ms !== expectMs) throw new Error(`raft: 걸음의 과반 시각 ${ms} 이 reachMajority ${expectMs} 과 다르다`);
          await phase('majority');
          if (lane === 'copy') setMetric('committed-writes', 1);
        } else {
          await phase('count');
        }
        await ctx.emit({
          type: 'response',
          payload: { lane, from, ms, count: got, n, majority: r.majority, reached, leader, term },
        });
        if (!(await pause())) return 'cancel';
        if (reached) return i;
      }
      if (expectMs !== -1) throw new Error('raft: 걸음은 과반에 못 닿았는데 reachMajority 는 닿았다');
      await phase('no-majority');
      await ctx.emit({ type: 'no-majority', payload: { votes: got, n, majority: r.majority } });
      if (!(await pause())) return 'cancel';
      return 'short';
    };

    const overflow = async (lane: 'vote' | 'copy', reachedAt: number): Promise<boolean> => {
      const rest = r.liveFollowers.slice(reachedAt + 1);
      if (rest.length === 0) return true;
      const ms = rest.map((_, k) => at(r.rtt, reachedAt + 1 + k, '왕복 ms'));
      await ctx.emit({ type: 'overflow', payload: { lane, from: rest, ms, count: r.alive, n } });
      return pause();
    };

    const voted = await collect('vote', r.electMs);
    if (voted === 'cancel') return false;
    if (voted === 'short') return true;
    if (!(await overflow('vote', voted))) return false;

    await phase('init');
    await ctx.emit({
      type: 'write',
      payload: { node: leader, command: data.command, index: 1, term, count: 1, n },
    });
    if (!(await pause())) return false;

    const copied = await collect('copy', r.commitMs);
    if (copied === 'cancel') return false;
    if (copied === 'short') throw new Error('raft: 리더가 섰는데 사본이 과반에 못 닿았다');
    if (!(await overflow('copy', copied))) return false;

    await ctx.emit({
      type: 'done',
      payload: { leader, electMs: r.electMs, commitMs: r.commitMs, count: r.alive, n, missing: r.down },
    });
    return pause();
  };

  let n = data.nodesStart;
  let stopped = data.stoppedStart;
  try {
    if (!(await play(n, stopped))) return;
    while (!ctx.cancelled) {
      const input = await ctx.waitForInput();
      if (ctx.cancelled) return;
      if (input.type !== 'nodes' && input.type !== 'stopped') continue;
      const payload = input.payload;
      if (typeof payload !== 'object' || payload === null) continue;
      const value = (payload as { value?: unknown }).value;
      if (typeof value !== 'number') continue;
      if (input.type === 'nodes') {
        if (!data.nodesLadder.includes(value)) throw new Error(`raft: 노드 수 ${value} 은 사다리 밖이다`);
        n = value;
      } else {
        if (!data.stoppedLadder.includes(value)) throw new Error(`raft: 멈춘 수 ${value} 은 사다리 밖이다`);
        stopped = value;
      }
      if (!(await play(n, stopped))) return;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
