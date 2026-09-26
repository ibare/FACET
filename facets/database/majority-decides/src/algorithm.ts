/**
 * majorityDecides — Raft 리더가 받은 쓰기가 사본 과반에서 확정되는 순간.
 *
 * 규약 (사양 그대로):
 * - 과반 = 노드 수 ÷ 2 의 몫 + 1. 노드 수에서 셈한다.
 * - 로그는 비어 있어야 한다 (아니면 던진다).
 * - 리더는 쓰기를 받은 때 제 로그 끝+1 번 칸에 (term, 명령) 을 적는다 (사본 1).
 * - 같은 때 멈추지 않은 것 · 멈춘 것 가리지 않고 팔로워 전부에게 보낸다. 멈춘 노드로 간 것은 닿지 않는다.
 * - 팔로워의 응답은 보낸 때 + 왕복 시간에 리더에 닿고, 닿으면 사본 +1.
 * - 확정 = 사본이 과반 이상이 되는 첫 순간. 그때 손님에게 ok 가 나간다.
 * - 응답은 닿는 시각 차례, 같은 시각이면 노드 이름 차례. 한 걸음 = 사건 하나.
 *
 * 이벤트 (전부 `await ctx.emit`):
 * - `init`   silent. payload `{ total: number; majority: number }` — 걸음 0 의 바탕
 * - `write`  payload `{ ms: number; node: string; index: number; term: number; cmd: string }`
 *            — 리더 로그 index 번 칸에 적힘 (사본 1)
 * - `send`   payload `{ ms: number; from: string; to: string[]; lost: string[] }`
 *            — 팔로워 전부에게 보냄. lost 는 닿지 않는 곳
 * - `ack`    payload `{ ms: number; node: string; effect: 'rise' | 'commit' | 'late' }`
 *            — 응답 하나가 리더에 닿아 사본 +1. rise = 과반 아래 · commit = 이번에 과반에 닿음 · late = 이미 확정
 * - `settle` payload `{ silent: string[] }` — 끝. 끝까지 응답이 없는 노드
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type MajorityDecidesNode = {
  id: string;
  /** 처음부터 멈춰 있다 — 받지도 답하지도 않는다 */
  stopped?: boolean;
  /** 보낸 때부터 응답이 리더에 닿기까지 (왕복, ms). 멈춘 노드는 없다 */
  roundTripMs?: number;
};

export type MajorityDecidesFacetData = {
  type: 'majority-decides';
  stepMs: number;
  leader: string;
  term: number;
  /** 리더의 로그 — 칸은 (term, 명령) */
  log: Array<{ term: number; cmd: string }>;
  nodes: MajorityDecidesNode[];
  write: { atMs: number; cmd: string };
};

type Arrival = { node: string; ms: number };

/** 응답이 닿는 차례를 데이터에서 셈한다. 모르는 모양은 던진다 (C6). */
function arrivals(data: MajorityDecidesFacetData): { arrivals: Arrival[]; followers: string[]; down: string[] } {
  const ids = new Set<string>();
  for (const n of data.nodes) {
    if (ids.has(n.id)) throw new Error(`majorityDecides: 노드 이름이 겹친다 — ${n.id}`);
    ids.add(n.id);
  }
  const leader = data.nodes.find((n) => n.id === data.leader);
  if (leader === undefined) throw new Error(`majorityDecides: 리더 ${data.leader} 가 노드 목록에 없다`);
  if (leader.stopped === true) throw new Error(`majorityDecides: 리더 ${data.leader} 가 멈춰 있다`);

  const list: Arrival[] = [];
  const followers: string[] = [];
  const down: string[] = [];
  for (const n of data.nodes) {
    if (n.id === data.leader) continue;
    followers.push(n.id);
    if (n.stopped === true) {
      if (n.roundTripMs !== undefined) throw new Error(`majorityDecides: 멈춘 노드 ${n.id} 에 왕복 시간이 있다`);
      down.push(n.id);
      continue;
    }
    if (typeof n.roundTripMs !== 'number' || !Number.isFinite(n.roundTripMs) || n.roundTripMs < 0) {
      throw new Error(`majorityDecides: 팔로워 ${n.id} 의 왕복 시간이 없다`);
    }
    list.push({ node: n.id, ms: data.write.atMs + n.roundTripMs });
  }
  list.sort((a, b) => (a.ms !== b.ms ? a.ms - b.ms : a.node < b.node ? -1 : a.node > b.node ? 1 : 0));
  return { arrivals: list, followers, down };
}

export async function majorityDecides(context: FacetContext<MajorityDecidesFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<MajorityDecidesFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const total = data.nodes.length;
  const majority = Math.floor(total / 2) + 1;
  const plan = arrivals(data);
  // 노드 하나면 리더가 적는 순간 확정이라 응답을 셀 것이 없다 — 이 조각의 모양이 아니다
  if (majority < 2) throw new Error(`majorityDecides: 노드가 ${total} — 과반을 셀 팔로워가 없다`);
  // 화면은 "로그는 비었다" 에서 출발한다 — 앞 칸이 있으면 그 칸의 사본까지 세야 해 이 조각의 모양이 아니다
  if (data.log.length !== 0) throw new Error(`majorityDecides: 로그가 비어 있어야 한다 — 칸 ${data.log.length}`);

  await ctx.emit({ type: 'init', silent: true, payload: { total, majority } });

  // 걸음 0 은 이미 읽을 것이 있는 화면 (노드 다섯 · 빈 로그) — 첫 발신 앞에 읽을 틈을 둔다
  if (!(await pause())) return;

  const t0 = data.write.atMs;
  const index = data.log.length + 1;
  let copies = 1;
  let committedAt: number | null = null;
  await ctx.emit({
    type: 'write',
    payload: { ms: t0, node: data.leader, index, term: data.term, cmd: data.write.cmd },
  });

  if (!(await pause())) return;
  await ctx.emit({
    type: 'send',
    payload: { ms: t0, from: data.leader, to: plan.followers, lost: plan.down },
  });

  for (const a of plan.arrivals) {
    if (!(await pause())) return;
    copies += 1;
    let effect: 'rise' | 'commit' | 'late';
    if (committedAt !== null) {
      effect = 'late';
    } else if (copies >= majority) {
      committedAt = a.ms;
      effect = 'commit';
    } else {
      effect = 'rise';
    }
    await ctx.emit({ type: 'ack', payload: { ms: a.ms, node: a.node, effect } });
  }

  if (!(await pause())) return;
  await ctx.emit({ type: 'settle', payload: { silent: plan.down } });
}
