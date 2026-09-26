/**
 * stale-copy — 한 서버에서 값을 고치면 다른 서버의 캐시 사본은 옛것으로 남는다.
 *
 * 모형: 서버마다 제 캐시에 한 키의 사본을 든다. 쓰기는 DB 를 고치고 **쓴 서버의 캐시만**
 * 고친다 (제 캐시에 write-through). 다른 서버에는 아무 알림도 없다. 읽기는 제 캐시에서 준다.
 * 만료는 없다. 옛값 판정 = 돌려준 값 ≠ 그때의 DB 값.
 *
 * 이벤트 (차례대로)
 *
 * - `init` (silent) — 걸음 0 의 셈값.
 *   payload: { readSlots: number; staleReads: number; distinct: number; stale: string[]; shared: number | null }
 *     readSlots  — 차례 안의 읽기 수 (받은 값 칸 수)
 *     staleReads — 옛값을 받은 읽기의 수 (처음 0)
 *     distinct   — DB 와 사본들에 걸친 서로 다른 값의 수
 *     stale      — DB 와 다른 값을 든 서버 식별자 (바탕 순서)
 *     shared     — 모든 사본이 같은 값이면 그 값, 하나라도 다르면 null
 * - `write` — 쓰기 하나.
 *   payload: { server: string; value: number; dbBefore: number; copyBefore: number;
 *              staleBefore: string[]; stale: string[]; distinct: number }
 *     dbBefore · copyBefore — 쓰기 앞의 DB 값 · 쓴 서버의 사본 값
 *     staleBefore · stale    — 쓰기 앞 · 뒤의 옛 사본 서버
 * - `read` — 읽기 하나.
 *   payload: { server: string; value: number; stale: boolean; slot: number; staleReads: number }
 *     value — 서버가 제 캐시에서 돌려준 값, stale — value ≠ 그때의 DB 값,
 *     slot — 몇 번째 읽기인가 (0 부터), staleReads — 이 읽기까지의 옛값 읽기 누계
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type StaleCopyOp =
  | { op: 'write'; server: string; value: number }
  | { op: 'read'; server: string };

export interface StaleCopyServer {
  id: string;
  /** 처음 캐시에 든 값 */
  cached: number;
}

export interface StaleCopyFacetData {
  type: 'stale-copy';
  /** 캐시 키 — 번역하지 않는 자료 */
  key: string;
  /** DB 의 처음 값 */
  dbValue: number;
  servers: StaleCopyServer[];
  ops: StaleCopyOp[];
  stepMs: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function needInt(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`stale-copy: ${path} 는 정수여야 한다 (받은 것: ${String(v)})`);
  }
  return v;
}

function needStr(v: unknown, path: string): string {
  if (typeof v !== 'string' || v === '') {
    throw new Error(`stale-copy: ${path} 는 빈 문자열이 아니어야 한다`);
  }
  return v;
}

/** 좁히개 — 알고리즘과 장면이 함께 부른다. 모양이 어긋나면 필드 경로를 담아 던진다. */
export function narrowStaleCopyData(raw: unknown): StaleCopyFacetData {
  if (!isRecord(raw)) throw new Error('stale-copy: 자료가 객체가 아니다');
  if (raw.type !== 'stale-copy') {
    throw new Error(`stale-copy: type 이 'stale-copy' 가 아니다 (받은 것: ${String(raw.type)})`);
  }
  const key = needStr(raw.key, 'key');
  const dbValue = needInt(raw.dbValue, 'dbValue');
  const stepMs = needInt(raw.stepMs, 'stepMs');
  if (!Array.isArray(raw.servers) || raw.servers.length === 0) {
    throw new Error('stale-copy: servers 는 비지 않은 배열이어야 한다');
  }
  const servers: StaleCopyServer[] = raw.servers.map((s, i) => {
    if (!isRecord(s)) throw new Error(`stale-copy: servers[${i}] 가 객체가 아니다`);
    return { id: needStr(s.id, `servers[${i}].id`), cached: needInt(s.cached, `servers[${i}].cached`) };
  });
  const ids = new Set(servers.map((s) => s.id));
  if (ids.size !== servers.length) throw new Error('stale-copy: servers 의 id 가 겹친다');
  if (!Array.isArray(raw.ops) || raw.ops.length === 0) {
    throw new Error('stale-copy: ops 는 비지 않은 배열이어야 한다');
  }
  const ops: StaleCopyOp[] = raw.ops.map((o, i) => {
    if (!isRecord(o)) throw new Error(`stale-copy: ops[${i}] 가 객체가 아니다`);
    const server = needStr(o.server, `ops[${i}].server`);
    if (!ids.has(server)) throw new Error(`stale-copy: ops[${i}].server '${server}' 는 servers 에 없다`);
    if (o.op === 'write') return { op: 'write', server, value: needInt(o.value, `ops[${i}].value`) };
    if (o.op === 'read') return { op: 'read', server };
    throw new Error(`stale-copy: ops[${i}].op 를 모른다 (받은 것: ${String(o.op)})`);
  });
  return { type: 'stale-copy', key, dbValue, servers, ops, stepMs };
}

/** DB 와 다른 값을 든 서버 — 바탕 순서 */
function staleServers(order: string[], copies: Map<string, number>, db: number): string[] {
  return order.filter((id) => {
    const v = copies.get(id);
    if (v === undefined) throw new Error(`stale-copy: 서버 '${id}' 의 사본이 없다`);
    return v !== db;
  });
}

/** 모든 사본이 같은 값이면 그 값, 아니면 null */
function sharedValue(copies: Map<string, number>): number | null {
  const values = new Set(copies.values());
  if (values.size !== 1) return null;
  const [only] = [...values];
  return only === undefined ? null : only;
}

function distinctValues(copies: Map<string, number>, db: number): number {
  return new Set([db, ...copies.values()]).size;
}

export async function staleCopy(context: FacetContext<StaleCopyFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<StaleCopyFacetData>;
  const data = narrowStaleCopyData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const order = data.servers.map((s) => s.id);
  const copies = new Map<string, number>(data.servers.map((s) => [s.id, s.cached]));
  let db = data.dbValue;
  let staleReads = 0;
  let slot = 0;

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      readSlots: data.ops.filter((o) => o.op === 'read').length,
      staleReads,
      distinct: distinctValues(copies, db),
      stale: staleServers(order, copies, db),
      shared: sharedValue(copies),
    },
  });

  // 걸음 0 은 서버 셋과 사본이 이미 선 화면이라, 첫 걸음 앞에도 읽을 틈을 둔다.
  for (const op of data.ops) {
    if (!(await pause())) return;
    if (op.op === 'write') {
      const copyBefore = copies.get(op.server);
      if (copyBefore === undefined) throw new Error(`stale-copy: 서버 '${op.server}' 의 사본이 없다`);
      const dbBefore = db;
      const staleBefore = staleServers(order, copies, db);
      // 쓰기: DB 를 고치고 쓴 서버의 캐시만 고친다. 다른 서버에는 아무것도 가지 않는다.
      db = op.value;
      copies.set(op.server, op.value);
      await ctx.emit({
        type: 'write',
        target: `node:${op.server}`,
        payload: {
          server: op.server,
          value: op.value,
          dbBefore,
          copyBefore,
          staleBefore,
          stale: staleServers(order, copies, db),
          distinct: distinctValues(copies, db),
        },
      });
    } else {
      const value = copies.get(op.server);
      if (value === undefined) throw new Error(`stale-copy: 서버 '${op.server}' 의 사본이 없다`);
      const stale = value !== db;
      if (stale) staleReads += 1;
      await ctx.emit({
        type: 'read',
        target: `node:${op.server}`,
        payload: { server: op.server, value, stale, slot, staleReads },
      });
      slot += 1;
    }
  }
}
