/**
 * 복제 지연 — 리더가 쓰기를 받자마자 ok 를 주면(비동기 복제) 새 값은 팔로워마다
 * 다른 때에 닿고, 그 틈의 읽기는 옛 값을 받는다.
 *
 * 규약 (사양 그대로)
 *   - 비동기 복제: 리더는 쓰기를 적자마자 ok 를 준다 (쓰기 시각 그대로).
 *   - 팔로워는 리더가 적은 때 + 제 지연 이 지난 시각에 같은 값을 적는다.
 *   - 읽기는 간 노드가 그 시각에 가진 값을 돌려준다.
 *   - 한 걸음 = 사건 하나, 시각 차례. 같은 시각이면 쓰기 → 적기 → 읽기, 그 안에서는 노드 이름 차례.
 *   - 옛 값 = 읽어 온 값이 그 시각 리더의 값과 다른 것.
 *   - 처음에는 모든 노드가 같은 값을 든다 (다르면 던진다).
 *
 * 이벤트
 *   init   (silent) { key: string; newValue: number; writeAt: number;
 *                     arrivals: { node: string; at: number }[]; endMs: number }
 *          — 바탕. 팔로워마다 새 값이 닿는 시각과 시간 축의 끝. 걸음 0 을 채운다.
 *   write  { at: number; node: string; key: string; value: number; caughtUp: number; total: number }
 *          — 리더가 쓰기를 적고 곧바로 ok. caughtUp = 그 시각 새 값을 가진 노드 수 (리더 포함).
 *   apply  { at: number; node: string; value: number; lag: number }
 *          — 팔로워가 새 값을 적는다. lag = 리더가 적은 때부터 걸린 ms.
 *   read   { at: number; node: string; value: number; leaderValue: number; stale: boolean;
 *            caughtUp: number; total: number }
 *          — 읽기 하나. caughtUp = 그 시각 리더의 값을 가진 노드 수 (리더 포함).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ReplicationNode = { id: string; value: number };
export type ReplicationLagEntry = { node: string; ms: number };
export type ReplicationRead = { at: number; node: string };

export type ReplicationLagFacetData = {
  type: 'replication-lag';
  stepMs: number;
  key: string;
  leader: string;
  nodes: ReplicationNode[];
  write: { at: number; node: string; value: number };
  lags: ReplicationLagEntry[];
  reads: ReplicationRead[];
};

type Happening =
  | { kind: 'write'; at: number; rank: 0; node: string }
  | { kind: 'apply'; at: number; rank: 1; node: string; lag: number }
  | { kind: 'read'; at: number; rank: 2; node: string };

function checkMs(v: number, what: string): void {
  if (!Number.isInteger(v) || v < 0) throw new Error(`replication-lag: ${what} 는 0 이상의 정수 ms 여야 한다 (${v})`);
}

/** 1차 데이터에서 사건 목록을 만든다. 모르는 노드 · 빠진 지연은 던진다. */
function planHappenings(data: ReplicationLagFacetData): Happening[] {
  const ids = data.nodes.map((n) => n.id);
  if (new Set(ids).size !== ids.length) throw new Error('replication-lag: 노드 식별자가 겹친다');
  if (!ids.includes(data.leader)) throw new Error(`replication-lag: 리더 ${data.leader} 가 노드에 없다`);
  const first = data.nodes[0];
  if (first === undefined) throw new Error('replication-lag: 노드가 없다');
  for (const n of data.nodes) {
    if (n.value !== first.value) throw new Error(`replication-lag: 처음 값이 노드마다 같아야 한다 (${n.id})`);
  }
  if (data.write.node !== data.leader) {
    throw new Error(`replication-lag: 쓰기는 리더로만 간다 (${data.write.node})`);
  }
  checkMs(data.write.at, '쓰기 시각');

  const out: Happening[] = [{ kind: 'write', at: data.write.at, rank: 0, node: data.leader }];
  const lagged = new Set<string>();
  for (const l of data.lags) {
    if (!ids.includes(l.node)) throw new Error(`replication-lag: 지연의 노드 ${l.node} 를 모른다`);
    if (l.node === data.leader) throw new Error('replication-lag: 리더에는 지연이 없다');
    if (lagged.has(l.node)) throw new Error(`replication-lag: ${l.node} 의 지연이 둘이다`);
    checkMs(l.ms, `${l.node} 의 지연`);
    lagged.add(l.node);
    out.push({ kind: 'apply', at: data.write.at + l.ms, rank: 1, node: l.node, lag: l.ms });
  }
  for (const id of ids) {
    if (id !== data.leader && !lagged.has(id)) throw new Error(`replication-lag: 팔로워 ${id} 의 지연이 없다`);
  }
  for (const r of data.reads) {
    if (!ids.includes(r.node)) throw new Error(`replication-lag: 읽기의 노드 ${r.node} 를 모른다`);
    checkMs(r.at, '읽기 시각');
    out.push({ kind: 'read', at: r.at, rank: 2, node: r.node });
  }
  out.sort((a, b) => a.at - b.at || a.rank - b.rank || (a.node < b.node ? -1 : a.node > b.node ? 1 : 0));
  return out;
}

export async function replicationLag(context: FacetContext<ReplicationLagFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<ReplicationLagFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const happenings = planHappenings(data);
  const held = new Map<string, number>();
  for (const n of data.nodes) held.set(n.id, n.value);

  function valueOf(id: string): number {
    const v = held.get(id);
    if (v === undefined) throw new Error(`replication-lag: 노드 ${id} 를 모른다`);
    return v;
  }

  const arrivals: { node: string; at: number }[] = [];
  let endMs = 0;
  for (const h of happenings) {
    if (h.kind === 'apply') arrivals.push({ node: h.node, at: h.at });
    endMs = Math.max(endMs, h.at);
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { key: data.key, newValue: data.write.value, writeAt: data.write.at, arrivals, endMs },
  });

  for (const h of happenings) {
    // 걸음 0 은 노드 셋과 시간 축이 이미 선 화면이라 첫 사건 앞에도 읽을 틈을 둔다.
    if (!(await pause())) return;
    if (h.kind === 'write') {
      held.set(h.node, data.write.value);
      let caughtUp = 0;
      for (const n of data.nodes) if (valueOf(n.id) === data.write.value) caughtUp += 1;
      await ctx.emit({
        type: 'write',
        payload: {
          at: h.at,
          node: h.node,
          key: data.key,
          value: data.write.value,
          caughtUp,
          total: data.nodes.length,
        },
      });
    } else if (h.kind === 'apply') {
      held.set(h.node, data.write.value);
      await ctx.emit({
        type: 'apply',
        payload: { at: h.at, node: h.node, value: data.write.value, lag: h.lag },
      });
    } else {
      const value = valueOf(h.node);
      const leaderValue = valueOf(data.leader);
      let caughtUp = 0;
      for (const n of data.nodes) if (valueOf(n.id) === leaderValue) caughtUp += 1;
      await ctx.emit({
        type: 'read',
        payload: {
          at: h.at,
          node: h.node,
          value,
          leaderValue,
          stale: value !== leaderValue,
          caughtUp,
          total: data.nodes.length,
        },
      });
    }
  }
}
