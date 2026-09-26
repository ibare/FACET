/**
 * 자기 쓰기 읽기 — 쓴 사람이 받은 번호를 들고 읽으러 가고, 번호에 못 미친 사본은 돌려보낸다.
 *
 * 사본 차례(`replicas` 순서)는 읽기가 돌려보내졌을 때 옮겨 갈 다음 사본을 정한다 (끝 다음은 처음).
 * 쓰기 · 사본의 따라잡기 · 읽기를 틱 순으로 늘어놓고, 마지막 읽기의 틱에서 재생을 끝낸다
 * (그 뒤 틱의 따라잡기는 오지 않는다). 같은 틱에 두 일이 있으면 던진다.
 *
 * 이벤트 (모두 걸음 경계 — silent 없음). 발신 앞마다 stepMs 를 쉰다 — 걸음 0 은 initial() 이
 * 자료에서 세운 사본 셋 · 클라이언트 둘이라 이미 읽을 것이 있다.
 *
 * - `write`   { tick: number; client: string; replica: string; value: number; version: number; token: number }
 *             리더가 번호를 1 올려 `version` 으로 값을 받는다. 쓴 쪽은 `token`(들고 있던 것과 `version` 중 큰 것)을 든다
 * - `refuse`  { tick: number; client: string; replica: string; replicaVersion: number; token: number; next: string }
 *             사본의 번호가 읽는 쪽의 번호에 못 미친다 — 돌려보낸다. 읽기는 `next` 로 옮겨 간다
 * - `serve`   { tick: number; client: string; replica: string; replicaVersion: number; token: number; value: number }
 *             사본의 번호 ≥ 읽는 쪽의 번호 — 그 사본의 값 `value` 를 준다
 * - `apply`   { tick: number; replica: string; source: string; value: number; version: number }
 *             뒤따르는 사본이 리더(`source`)의 값과 번호를 받는다
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ReplicaSeed = { id: string; value: number; version: number };
export type ClientSeed = { id: string; token: number };
export type WriteSeed = { tick: number; client: string; replica: string; value: number };
export type ApplySeed = { tick: number; replica: string };
export type ReadSeed = { tick: number; client: string; first: string };

export type ReadYourWriteFacetData = {
  type: 'read-your-write';
  key: string;
  leader: string;
  replicas: ReplicaSeed[];
  clients: ClientSeed[];
  writes: WriteSeed[];
  applies: ApplySeed[];
  reads: ReadSeed[];
  stepMs: number;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function needString(o: Record<string, unknown>, k: string, path: string): string {
  const v = o[k];
  if (typeof v !== 'string' || v === '') throw new Error(`read-your-write: ${path}.${k} 는 빈 칸이 아닌 문자열이어야 한다`);
  return v;
}

function needInt(o: Record<string, unknown>, k: string, path: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new Error(`read-your-write: ${path}.${k} 는 0 이상의 정수여야 한다`);
  }
  return v;
}

function needList(o: Record<string, unknown>, k: string): Record<string, unknown>[] {
  const v = o[k];
  if (!Array.isArray(v)) throw new Error(`read-your-write: ${k} 는 배열이어야 한다`);
  return v.map((item, i) => {
    if (!isRecord(item)) throw new Error(`read-your-write: ${k}[${i}] 는 객체여야 한다`);
    return item;
  });
}

/** 자료 좁히개 — 알고리즘과 장면의 initial 이 함께 부른다. 모양이 어긋나면 던진다. */
export function parseReadYourWriteData(raw: unknown): ReadYourWriteFacetData {
  if (!isRecord(raw)) throw new Error('read-your-write: 자료가 객체가 아니다');
  if (raw.type !== 'read-your-write') throw new Error('read-your-write: type 이 read-your-write 가 아니다');
  const key = needString(raw, 'key', 'data');
  const leader = needString(raw, 'leader', 'data');
  const stepMs = needInt(raw, 'stepMs', 'data');
  const replicas = needList(raw, 'replicas').map((r, i) => ({
    id: needString(r, 'id', `replicas[${i}]`),
    value: needInt(r, 'value', `replicas[${i}]`),
    version: needInt(r, 'version', `replicas[${i}]`),
  }));
  if (replicas.length < 2) throw new Error('read-your-write: 사본은 둘 이상이어야 한다');
  const replicaIds = new Set(replicas.map((r) => r.id));
  if (replicaIds.size !== replicas.length) throw new Error('read-your-write: 사본 식별자가 겹친다');
  if (!replicaIds.has(leader)) throw new Error(`read-your-write: 리더 ${leader} 가 사본 목록에 없다`);
  const clients = needList(raw, 'clients').map((c, i) => ({
    id: needString(c, 'id', `clients[${i}]`),
    token: needInt(c, 'token', `clients[${i}]`),
  }));
  const clientIds = new Set(clients.map((c) => c.id));
  if (clientIds.size !== clients.length) throw new Error('read-your-write: 클라이언트 식별자가 겹친다');
  const replicaOf = (o: Record<string, unknown>, k: string, path: string): string => {
    const id = needString(o, k, path);
    if (!replicaIds.has(id)) throw new Error(`read-your-write: ${path}.${k} = ${id} 는 사본 목록에 없다`);
    return id;
  };
  const clientOf = (o: Record<string, unknown>, path: string): string => {
    const id = needString(o, 'client', path);
    if (!clientIds.has(id)) throw new Error(`read-your-write: ${path}.client = ${id} 는 클라이언트 목록에 없다`);
    return id;
  };
  const writes = needList(raw, 'writes').map((w, i) => ({
    tick: needInt(w, 'tick', `writes[${i}]`),
    client: clientOf(w, `writes[${i}]`),
    replica: replicaOf(w, 'replica', `writes[${i}]`),
    value: needInt(w, 'value', `writes[${i}]`),
  }));
  const applies = needList(raw, 'applies').map((a, i) => ({
    tick: needInt(a, 'tick', `applies[${i}]`),
    replica: replicaOf(a, 'replica', `applies[${i}]`),
  }));
  const reads = needList(raw, 'reads').map((r, i) => ({
    tick: needInt(r, 'tick', `reads[${i}]`),
    client: clientOf(r, `reads[${i}]`),
    first: replicaOf(r, 'first', `reads[${i}]`),
  }));
  if (reads.length === 0) throw new Error('read-your-write: 읽기가 없다 — 재생이 끝날 틱을 정할 수 없다');
  return { type: 'read-your-write', key, leader, replicas, clients, writes, applies, reads, stepMs };
}

/** 사본 차례에서 `id` 다음 사본 (끝 다음은 처음). */
export function nextReplica(order: readonly string[], id: string): string {
  const i = order.indexOf(id);
  if (i < 0) throw new Error(`read-your-write: 사본 ${id} 가 차례에 없다`);
  const next = order[(i + 1) % order.length];
  if (next === undefined) throw new Error('read-your-write: 사본 차례가 비었다');
  return next;
}

type Happening =
  | { kind: 'write'; tick: number; seed: WriteSeed }
  | { kind: 'apply'; tick: number; seed: ApplySeed }
  | { kind: 'read'; tick: number; seed: ReadSeed };

export async function readYourWrite(context: FacetContext<ReadYourWriteFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<ReadYourWriteFacetData>;
  const data = parseReadYourWriteData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const order = data.replicas.map((r) => r.id);
  const state = new Map<string, { value: number; version: number }>();
  for (const r of data.replicas) state.set(r.id, { value: r.value, version: r.version });
  const tokens = new Map<string, number>();
  for (const c of data.clients) tokens.set(c.id, c.token);

  const replicaState = (id: string): { value: number; version: number } => {
    const s = state.get(id);
    if (!s) throw new Error(`read-your-write: 사본 ${id} 의 상태가 없다`);
    return s;
  };
  const tokenOf = (id: string): number => {
    const n = tokens.get(id);
    if (n === undefined) throw new Error(`read-your-write: 클라이언트 ${id} 의 번호가 없다`);
    return n;
  };

  // 재생은 마지막 읽기의 틱에서 끝난다 — 그 뒤의 일은 오지 않는다
  const endTick = Math.max(...data.reads.map((r) => r.tick));
  const happenings: Happening[] = [
    ...data.writes.map((seed): Happening => ({ kind: 'write', tick: seed.tick, seed })),
    ...data.applies.map((seed): Happening => ({ kind: 'apply', tick: seed.tick, seed })),
    ...data.reads.map((seed): Happening => ({ kind: 'read', tick: seed.tick, seed })),
  ]
    .filter((h) => h.tick <= endTick)
    .sort((a, b) => a.tick - b.tick);
  for (let i = 1; i < happenings.length; i += 1) {
    const prev = happenings[i - 1];
    const cur = happenings[i];
    if (prev && cur && prev.tick === cur.tick) {
      throw new Error(`read-your-write: 틱 ${cur.tick} 에 두 일이 겹친다`);
    }
  }

  for (const h of happenings) {
    if (!(await pause())) return;
    if (h.kind === 'write') {
      const w = h.seed;
      if (w.replica !== data.leader) throw new Error(`read-your-write: 쓰기는 리더 ${data.leader} 가 받는다 (받은 쪽 ${w.replica})`);
      const leader = replicaState(w.replica);
      const version = leader.version + 1;
      state.set(w.replica, { value: w.value, version });
      const token = Math.max(tokenOf(w.client), version);
      tokens.set(w.client, token);
      await ctx.emit({
        type: 'write',
        payload: { tick: w.tick, client: w.client, replica: w.replica, value: w.value, version, token },
      });
      continue;
    }
    if (h.kind === 'apply') {
      const a = h.seed;
      if (a.replica === data.leader) throw new Error(`read-your-write: 리더 ${a.replica} 는 따라잡을 쪽이 아니다`);
      const src = replicaState(data.leader);
      const before = replicaState(a.replica);
      if (src.version <= before.version) {
        throw new Error(`read-your-write: 틱 ${a.tick} 에 ${a.replica} 가 받을 새 번호가 없다 (리더 ${src.version}, 사본 ${before.version})`);
      }
      state.set(a.replica, { value: src.value, version: src.version });
      await ctx.emit({
        type: 'apply',
        payload: { tick: a.tick, replica: a.replica, source: data.leader, value: src.value, version: src.version },
      });
      continue;
    }
    // 읽기 — 한 사본에 묻기 하나가 한 걸음
    const r = h.seed;
    const token = tokenOf(r.client);
    let at = r.first;
    let asked = 0;
    for (;;) {
      if (ctx.cancelled) return;
      asked += 1;
      if (asked > order.length) {
        throw new Error(`read-your-write: 틱 ${r.tick} 의 ${r.client} 읽기를 모든 사본이 돌려보냈다`);
      }
      const s = replicaState(at);
      if (s.version >= token) {
        await ctx.emit({
          type: 'serve',
          payload: { tick: r.tick, client: r.client, replica: at, replicaVersion: s.version, token, value: s.value },
        });
        break;
      }
      const next = nextReplica(order, at);
      await ctx.emit({
        type: 'refuse',
        payload: { tick: r.tick, client: r.client, replica: at, replicaVersion: s.version, token, next },
      });
      at = next;
      if (!(await pause())) return;
    }
  }
}
