/**
 * elect-a-leader — 리더가 없을 때 Raft 의 노드들은 어떻게 하나를 뽑는가.
 *
 * 작은 모형을 실제로 돌린다. 사건 큐에서 가장 이른 것을 하나씩 꺼내고, 걸음 묶기 규약대로 이벤트를 낸다.
 *
 * 규약 (사양 그대로. 다만 후보도 제 타이머를 다시 채우는 것은 사양에 없고 sim.py 규약을 따랐다)
 *   - 선출 타이머의 첫 마감 = 0 ms + 제 타이머 값. 메시지 편도 지연은 `delayMs`.
 *   - 타이머가 다 되면: term +1 · 후보 · 제게 표 1 · 나머지에게 표 요청.
 *   - sim.py 규약: 후보도 제 타이머를 다시 채운다 (새 마감 = 다 된 시각 + 제 타이머 값).
 *   - 표 요청을 받은 노드는 그 term 에 아직 표를 안 줬으면 준다. 표를 주면 타이머를 다시 채운다
 *     (새 마감 = 받은 시각 + 제 타이머 값).
 *   - 과반 = 노드 수 ÷ 2 의 몫 + 1. 과반에 닿는 순간 리더, 곧바로 하트비트를 나머지에게.
 *   - 하트비트를 받은 팔로워는 타이머를 다시 채운다. 리더에게는 선출 타이머가 없다.
 *   - 같은 시각: 메시지가 타이머보다 먼저, 메시지끼리는 보낸 노드 이름 차례 (그다음 받는 노드 이름 차례).
 *   - 걸음 묶기: 과반까지 세는 표는 하나 = 한 걸음 (과반을 채운 표와 리더 됨은 한 걸음).
 *     같은 시각의 표 요청 받기 · 과반 뒤 넘치는 표 · 하트비트 받기는 종류마다 한 걸음.
 *   - 끝: 리더가 선 뒤 첫 하트비트가 모두 닿은 걸음.
 *   - 이 조각이 그리지 않는 갈래(표 거절 · 두 번째 후보 · 후보의 타이머가 다시 다 됨)를 만나면 던진다.
 *
 * 이벤트 (전부 silent 아님. 걸음 0 은 initialData 에서 장면이 세운다)
 *   timeout   { at: number; node: string; term: number; deadline: number; majority: number }
 *             node 의 타이머가 at 에 다 됐다. 후보가 되어 term 으로 올라가고 제 표 하나. 새 마감 deadline.
 *   grant     { at: number; from: string; term: number; voters: { node: string; deadline: number }[] }
 *             from 의 표 요청이 at 에 voters 에 닿았다. 모두 표를 주고 마감을 deadline 으로 다시 채웠다.
 *   vote      { at: number; from: string; to: string; votes: number }
 *             from 의 표가 후보 to 에 닿았다. 센 표는 votes (과반 아래).
 *   leader    { at: number; from: string; to: string; votes: number; term: number }
 *             from 의 표로 votes 가 과반에 닿았다. to 가 term 의 리더다.
 *   extra     { at: number; froms: string[]; to: string; votes: number; term: number }
 *             이미 term 의 리더인 to 에 넘치는 표가 닿았다. 센 표는 votes. 바뀌는 것 없다.
 *   heartbeat { at: number; leader: string; term: number; receivers: { node: string; deadline: number }[] }
 *             leader 의 하트비트가 at 에 receivers 에 닿았다. 마감을 deadline 으로 다시 채웠다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ElectNode = { id: string; timeoutMs: number };

export type ElectALeaderFacetData = {
  type: 'elect-a-leader';
  stepMs: number;
  /** 처음 모두의 term */
  term: number;
  /** 메시지 편도 지연 (ms) */
  delayMs: number;
  nodes: ElectNode[];
};

type Role = 'follower' | 'candidate' | 'leader';
type MsgKind = 'request' | 'vote' | 'heartbeat';
type Msg = { at: number; src: string; dst: string; kind: MsgKind; term: number };

/** 모형이 이만큼 흘러도 끝나지 않으면 규약 밖이다. */
const TIME_LIMIT_MS = 10_000;

/** 과반 = 노드 수 ÷ 2 의 몫 + 1. */
export function majorityOf(count: number): number {
  return Math.floor(count / 2) + 1;
}

function byMessageOrder(a: Msg, b: Msg): number {
  if (a.at !== b.at) return a.at - b.at;
  if (a.src !== b.src) return a.src < b.src ? -1 : 1;
  if (a.dst !== b.dst) return a.dst < b.dst ? -1 : 1;
  return 0;
}

export async function electALeader(context: FacetContext<ElectALeaderFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<ElectALeaderFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;
  const ids = data.nodes.map((n) => n.id);
  if (ids.length < 2) throw new Error('elect-a-leader: 노드가 둘 이상이어야 한다');
  if (new Set(ids).size !== ids.length) throw new Error('elect-a-leader: 노드 식별자가 겹친다');
  const majority = majorityOf(ids.length);

  const timeoutOf = new Map<string, number>();
  const role = new Map<string, Role>();
  const term = new Map<string, number>();
  const votedFor = new Map<string, string | null>();
  const deadline = new Map<string, number>();
  for (const n of data.nodes) {
    timeoutOf.set(n.id, n.timeoutMs);
    role.set(n.id, 'follower');
    term.set(n.id, data.term);
    votedFor.set(n.id, null);
    deadline.set(n.id, n.timeoutMs);
  }
  const need = <V>(m: Map<string, V>, id: string): V => {
    const v = m.get(id);
    if (v === undefined) throw new Error(`elect-a-leader: 모르는 노드 ${id}`);
    return v;
  };

  let queue: Msg[] = [];
  const ballots = new Map<string, Set<string>>();
  let candidate: string | null = null;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  function nextTimer(): { at: number; node: string } | null {
    let best: { at: number; node: string } | null = null;
    for (const id of ids) {
      if (need(role, id) === 'leader') continue;
      const at = need(deadline, id);
      if (best === null || at < best.at || (at === best.at && id < best.node)) best = { at, node: id };
    }
    return best;
  }

  /** 큐 맨 앞과 같은 시각 · 같은 종류로 이어지는 메시지를 꺼낸다. */
  function takeBatch(): Msg[] {
    const head = queue[0];
    if (head === undefined) throw new Error('elect-a-leader: 빈 큐에서 꺼낸다');
    let end = 1;
    while (end < queue.length) {
      const m = queue[end];
      if (m === undefined || m.at !== head.at || m.kind !== head.kind) break;
      end += 1;
    }
    const batch = queue.slice(0, end);
    queue = queue.slice(end);
    return batch;
  }

  function send(at: number, src: string, kind: MsgKind, t: number): void {
    for (const dst of ids) {
      if (dst !== src) queue.push({ at: at + data.delayMs, src, dst, kind, term: t });
    }
    queue.sort(byMessageOrder);
  }

  // 걸음 0 은 이미 읽을 것이 있는 화면이다 — 루프 첫 문이 그 틈을 준다.
  while (true) {
    if (!(await pause())) return;
    const timer = nextTimer();
    const head = queue[0];

    if (head === undefined || (timer !== null && timer.at < head.at)) {
      // 타이머가 먼저 — 같은 시각이면 메시지가 먼저이므로 `<`.
      if (timer === null) throw new Error('elect-a-leader: 타이머도 메시지도 없다');
      if (timer.at > TIME_LIMIT_MS) throw new Error('elect-a-leader: 끝나지 않는다');
      if (candidate !== null) {
        throw new Error(`elect-a-leader: ${timer.node} 의 타이머가 ${timer.at} ms 에 다시 다 된다 — 이 조각은 두 번째 선거를 그리지 않는다`);
      }
      const node = timer.node;
      const t = need(term, node) + 1;
      term.set(node, t);
      role.set(node, 'candidate');
      votedFor.set(node, node);
      ballots.set(node, new Set([node]));
      candidate = node;
      const next = timer.at + need(timeoutOf, node);
      deadline.set(node, next);
      send(timer.at, node, 'request', t);
      await ctx.emit({ type: 'timeout', payload: { at: timer.at, node, term: t, deadline: next, majority } });
      continue;
    }

    const batch = takeBatch();
    if (head.kind === 'request') {
      const voters: { node: string; deadline: number }[] = [];
      for (const m of batch) {
        if (m.src !== head.src) throw new Error('elect-a-leader: 같은 시각에 표 요청이 둘 — 이 조각의 규약 밖');
        if (m.term > need(term, m.dst)) {
          term.set(m.dst, m.term);
          votedFor.set(m.dst, null);
          role.set(m.dst, 'follower');
        }
        const voted = need(votedFor, m.dst);
        if (m.term !== need(term, m.dst) || (voted !== null && voted !== m.src)) {
          throw new Error(`elect-a-leader: ${m.dst} 가 표를 거절한다 — 이 조각은 거절을 그리지 않는다`);
        }
        votedFor.set(m.dst, m.src);
        const next = m.at + need(timeoutOf, m.dst);
        deadline.set(m.dst, next);
        voters.push({ node: m.dst, deadline: next });
        queue.push({ at: m.at + data.delayMs, src: m.dst, dst: m.src, kind: 'vote', term: m.term });
      }
      queue.sort(byMessageOrder);
      await ctx.emit({ type: 'grant', payload: { at: head.at, from: head.src, term: head.term, voters } });
      continue;
    }

    if (head.kind === 'vote') {
      const to = head.dst;
      const box = ballots.get(to);
      if (box === undefined) throw new Error(`elect-a-leader: 후보가 아닌 ${to} 에 표가 닿는다`);
      if (need(role, to) === 'leader') {
        // 넘치는 표 — 같은 시각에 이어 닿은 것을 한 걸음으로.
        const froms: string[] = [];
        for (const m of batch) {
          if (m.dst !== to) throw new Error('elect-a-leader: 넘치는 표가 두 후보에게 간다 — 이 조각의 규약 밖');
          box.add(m.src);
          froms.push(m.src);
        }
        await ctx.emit({ type: 'extra', payload: { at: head.at, froms, to, votes: box.size, term: need(term, to) } });
        continue;
      }
      // 과반까지 세는 표는 하나씩 — 나머지는 큐로 되돌린다.
      queue = [...batch.slice(1), ...queue];
      box.add(head.src);
      if (box.size >= majority) {
        role.set(to, 'leader');
        const t = need(term, to);
        send(head.at, to, 'heartbeat', t);
        await ctx.emit({ type: 'leader', payload: { at: head.at, from: head.src, to, votes: box.size, term: t } });
      } else {
        await ctx.emit({ type: 'vote', payload: { at: head.at, from: head.src, to, votes: box.size } });
      }
      continue;
    }

    // heartbeat
    const receivers: { node: string; deadline: number }[] = [];
    for (const m of batch) {
      if (m.term < need(term, m.dst)) throw new Error(`elect-a-leader: ${m.dst} 에 낡은 하트비트 — 이 조각의 규약 밖`);
      term.set(m.dst, m.term);
      role.set(m.dst, 'follower');
      const next = m.at + need(timeoutOf, m.dst);
      deadline.set(m.dst, next);
      receivers.push({ node: m.dst, deadline: next });
    }
    await ctx.emit({ type: 'heartbeat', payload: { at: head.at, leader: head.src, term: head.term, receivers } });
    if (queue.length === 0) return;
  }
}
