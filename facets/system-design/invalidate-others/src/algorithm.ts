/**
 * invalidate-others — 한 서버가 값을 고치면 다른 서버들의 사본에 "버려라" 만 보낸다.
 *
 * 모형
 * - 키 하나(`key`)의 원본은 DB 가, 사본은 서버들의 캐시가 든다. 처음에 `cachedAt` 의 서버가 DB 값을 든다.
 * - 쓰기: DB 를 고치고 쓴 서버의 캐시를 고친다.
 * - 무효화: 쓴 서버가 그 키를 들고 있는 **다른 서버 모두**에 한 통씩 보낸다. 받으면 그 키를 지운다.
 *   값을 싣지 않는다 (write-invalidate · write-update 가 아니다).
 * - 읽기: 캐시에 있으면 적중, 없으면 DB 에서 가져와 캐시에 채운다.
 * - 한 걸음 = 쓰기 하나 / 무효화 한 묶음 / 읽기 하나. 시간은 셈하지 않는다.
 *
 * 이벤트 (발신 순서대로)
 * - `init` (silent) — `{ held: number; dbReads: number }`
 *     들고 있는 사본의 수 · DB 에 간 읽기의 수(0). 걸음 0 의 계기를 채운다.
 * - `write` — `{ server: string; value: number; wasDb: number; wasSlot: number | null; stale: string[] }`
 *     `stale` 은 쓰기 뒤 DB 와 다른 값을 든 서버들(옛 사본).
 * - `invalidate` — `{ from: string; targets: { server: string; was: number }[]; heldBefore: number; heldAfter: number; stale: string[] }`
 *     `targets` 는 무효화를 받아 사본을 지운 서버와 지우기 전 값. 값은 싣지 않는다.
 * - `read` — `{ server: string; hit: boolean; value: number; held: number; dbReads: number; stale: boolean }`
 *     `stale` 은 받은 값이 DB 와 다른가(옛값 읽기).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type InvalidateOthersOp =
  | { op: 'write'; server: string; value: number }
  | { op: 'invalidate'; server: string }
  | { op: 'read'; server: string };

export interface InvalidateOthersFacetData {
  type: 'invalidate-others';
  stepMs: number;
  /** 캐시 키 — 번역하지 않는 자료 */
  key: string;
  /** DB 가 처음 든 값 */
  dbValue: number;
  /** 서버 식별자 — 왼쪽부터 */
  servers: string[];
  /** 처음에 DB 값의 사본을 든 서버 */
  cachedAt: string[];
  /** 일어나는 차례 */
  events: InvalidateOthersOp[];
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/** 자료 좁히개 — 알고리즘과 장면이 함께 부른다. 어긋나면 필드 경로를 담아 던진다. */
export function narrowInvalidateOthersData(raw: unknown): InvalidateOthersFacetData {
  if (!isRecord(raw)) throw new Error('invalidate-others: initialData 가 객체가 아니다');
  if (raw.type !== 'invalidate-others') {
    throw new Error(`invalidate-others: initialData.type 이 'invalidate-others' 가 아니다 (${String(raw.type)})`);
  }
  if (!isFiniteNumber(raw.stepMs) || raw.stepMs <= 0) throw new Error('invalidate-others: initialData.stepMs 가 양수가 아니다');
  if (typeof raw.key !== 'string' || raw.key === '') throw new Error('invalidate-others: initialData.key 가 빈 문자열이거나 없다');
  if (!isFiniteNumber(raw.dbValue)) throw new Error('invalidate-others: initialData.dbValue 가 수가 아니다');
  if (!Array.isArray(raw.servers) || raw.servers.length === 0) {
    throw new Error('invalidate-others: initialData.servers 가 빈 배열이거나 없다');
  }
  const servers: string[] = [];
  raw.servers.forEach((s, i) => {
    if (typeof s !== 'string' || s === '') throw new Error(`invalidate-others: initialData.servers[${i}] 가 식별자가 아니다`);
    if (servers.includes(s)) throw new Error(`invalidate-others: initialData.servers[${i}] 가 겹친다 (${s})`);
    servers.push(s);
  });
  if (!Array.isArray(raw.cachedAt)) throw new Error('invalidate-others: initialData.cachedAt 이 배열이 아니다');
  const cachedAt: string[] = [];
  raw.cachedAt.forEach((s, i) => {
    if (typeof s !== 'string' || !servers.includes(s)) {
      throw new Error(`invalidate-others: initialData.cachedAt[${i}] 가 servers 에 없다 (${String(s)})`);
    }
    if (cachedAt.includes(s)) throw new Error(`invalidate-others: initialData.cachedAt[${i}] 가 겹친다 (${s})`);
    cachedAt.push(s);
  });
  if (!Array.isArray(raw.events) || raw.events.length === 0) {
    throw new Error('invalidate-others: initialData.events 가 빈 배열이거나 없다');
  }
  const events: InvalidateOthersOp[] = raw.events.map((e, i): InvalidateOthersOp => {
    const at = `invalidate-others: initialData.events[${i}]`;
    if (!isRecord(e)) throw new Error(`${at} 가 객체가 아니다`);
    if (typeof e.server !== 'string' || !servers.includes(e.server)) {
      throw new Error(`${at}.server 가 servers 에 없다 (${String(e.server)})`);
    }
    switch (e.op) {
      case 'write':
        if (!isFiniteNumber(e.value)) throw new Error(`${at}.value 가 수가 아니다`);
        return { op: 'write', server: e.server, value: e.value };
      case 'invalidate':
        return { op: 'invalidate', server: e.server };
      case 'read':
        return { op: 'read', server: e.server };
      default:
        throw new Error(`${at}.op 를 모른다 (${String(e.op)})`);
    }
  });
  return {
    type: 'invalidate-others',
    stepMs: raw.stepMs,
    key: raw.key,
    dbValue: raw.dbValue,
    servers,
    cachedAt,
    events,
  };
}

/** 캐시가 든 사본 수 */
function countHeld(local: Map<string, number>): number {
  return local.size;
}

/** DB 와 다른 값을 든 서버 — 서버 차례대로 */
function staleServers(servers: string[], local: Map<string, number>, db: number): string[] {
  return servers.filter((s) => {
    const v = local.get(s);
    return v !== undefined && v !== db;
  });
}

export async function invalidateOthers(ctx: FacetContext<InvalidateOthersFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<InvalidateOthersFacetData>;
  const data = narrowInvalidateOthersData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  let db = data.dbValue;
  // 서버마다 그 키의 사본 — 없으면 들지 않은 것
  const local = new Map<string, number>();
  for (const s of data.cachedAt) local.set(s, db);
  let dbReads = 0;

  await rctx.emit({ type: 'init', payload: { held: countHeld(local), dbReads }, silent: true });

  for (const ev of data.events) {
    // 걸음 0(처음 사본들)도 읽을 틈을 둔다
    if (!(await pause())) return;
    if (ev.op === 'write') {
      const wasDb = db;
      const had = local.get(ev.server);
      db = ev.value;
      local.set(ev.server, ev.value);
      await rctx.emit({
        type: 'write',
        payload: {
          server: ev.server,
          value: ev.value,
          wasDb,
          wasSlot: had === undefined ? null : had,
          stale: staleServers(data.servers, local, db),
        },
      });
    } else if (ev.op === 'invalidate') {
      const heldBefore = countHeld(local);
      const targets: { server: string; was: number }[] = [];
      for (const s of data.servers) {
        if (s === ev.server) continue;
        const v = local.get(s);
        if (v === undefined) continue;
        targets.push({ server: s, was: v });
      }
      // 버린다 — 새 값을 넣지 않는다
      for (const tg of targets) local.delete(tg.server);
      await rctx.emit({
        type: 'invalidate',
        payload: {
          from: ev.server,
          targets,
          heldBefore,
          heldAfter: countHeld(local),
          stale: staleServers(data.servers, local, db),
        },
      });
    } else {
      const cached = local.get(ev.server);
      let value: number;
      let hit: boolean;
      if (cached !== undefined) {
        value = cached;
        hit = true;
      } else {
        value = db;
        hit = false;
        dbReads += 1;
        local.set(ev.server, value);
      }
      await rctx.emit({
        type: 'read',
        payload: {
          server: ev.server,
          hit,
          value,
          held: countHeld(local),
          dbReads,
          stale: value !== db,
        },
      });
    }
  }
}
