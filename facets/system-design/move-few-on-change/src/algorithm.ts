/**
 * move-few-on-change — 서버 하나가 빠질 때 해시 링과 나머지 해싱에서 옮겨 가는 키의 수.
 *
 * 같은 키 열둘이 두 방식으로 서버 넷에 놓여 있다. 한 걸음에 서버 하나가 두 쪽에서 함께 빠지고,
 * 이어 키를 하나씩 두 쪽에서 함께 다시 놓는다. 링 쪽은 빠진 서버가 쥐던 키만 시계 방향 다음 서버로
 * 옮기고, 나머지 쪽은 N 이 줄어 남은 서버끼리도 자리를 바꾼다.
 *
 * 해시: h32(s) = FNV-1a 32비트(UTF-8 바이트) 뒤 murmur3 마무리 섞기(fmix32).
 * 링 자리: floor(h32 × ringSize / 2^32). 링 주인: 자리 ≥ p 인 서버 가운데 가장 작은 자리, 없으면 가장 작은
 * 자리로 감아 돈다. 나머지 주인: 서버 목록[h32 mod N] — 빠진 뒤에는 남은 것을 원래 차례대로 다시 번호 매긴다.
 *
 * 이벤트 (전부 target 없음)
 * - `init` (silent: true) — 걸음 0 의 바탕. 셈으로 나오는 자리 · 처음 주인을 싣는다.
 *     payload: {
 *       ringSize: number,
 *       servers: Array<{ id: string, pos: number, index: number }>,   // 목록 차례. pos = 링 자리, index = 나머지 번호
 *       keys: Array<{ id: string, pos: number, ringOwner: string, modIndex: number, modOwner: string }>,  // 다시 놓는 차례
 *       rows: number,   // 한 서버 칸에 한때 쌓이는 키 칸의 최대 — 처음 쥔 키 + 옮겨 온 키, 두 쪽을 통틀어 (stage 의 세로 축척)
 *     }
 * - `remove` — 걸음 1. 서버 하나가 두 쪽에서 함께 빠진다.
 *     payload: { server: string, successor: string, survivors: string[] }
 *       // successor = 링에서 빠진 서버의 시계 방향 다음 서버, survivors = 남은 서버를 원래 차례대로(새 나머지 번호 차례)
 * - `place` — 걸음 2..: 키 하나를 두 쪽에서 함께 다시 놓는다.
 *     payload: {
 *       key: string,
 *       ringTo: string, ringMoved: boolean,
 *       modIndex: number, modTo: string, modMoved: boolean,
 *       ringTally: number, modTally: number,   // 이 걸음까지 옮겨 간 키의 누계
 *     }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type MoveFewOnChangeFacetData = {
  type: 'move-few-on-change';
  stepMs: number;
  ringSize: number;
  /** 해시 입력 그대로. 이 차례가 나머지 해싱의 번호 차례다. */
  servers: string[];
  /** 다시 놓는 차례. 해시 입력 그대로. */
  keys: string[];
  /** 빠지는 서버. */
  removed: string;
};

export type ServerBase = { id: string; pos: number; index: number };
export type KeyBase = {
  id: string;
  pos: number;
  ringOwner: string;
  modIndex: number;
  modOwner: string;
};

function stringList(raw: unknown, path: string): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`move-few-on-change: ${path} 는 비지 않은 배열이어야 한다`);
  }
  const out: string[] = [];
  raw.forEach((v, i) => {
    if (typeof v !== 'string' || v.length === 0) {
      throw new Error(`move-few-on-change: ${path}[${i}] 는 비지 않은 문자열이어야 한다`);
    }
    if (out.includes(v)) throw new Error(`move-few-on-change: ${path}[${i}] "${v}" 가 겹친다`);
    out.push(v);
  });
  return out;
}

/** 자료 좁히개 — 알고리즘과 장면이 함께 부른다. 어긋나면 던진다. */
export function narrowMoveFewData(raw: unknown): MoveFewOnChangeFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('move-few-on-change: 자료가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'move-few-on-change') {
    throw new Error(`move-few-on-change: type 이 다르다 (${String(r.type)})`);
  }
  if (typeof r.stepMs !== 'number' || !Number.isFinite(r.stepMs) || r.stepMs < 0) {
    throw new Error('move-few-on-change: stepMs 는 0 이상의 수여야 한다');
  }
  if (typeof r.ringSize !== 'number' || !Number.isInteger(r.ringSize) || r.ringSize < 2) {
    throw new Error('move-few-on-change: ringSize 는 2 이상의 정수여야 한다');
  }
  const servers = stringList(r.servers, 'servers');
  if (servers.length < 2) throw new Error('move-few-on-change: servers 는 둘 이상이어야 한다');
  const keys = stringList(r.keys, 'keys');
  if (typeof r.removed !== 'string' || !servers.includes(r.removed)) {
    throw new Error(`move-few-on-change: removed "${String(r.removed)}" 가 servers 에 없다`);
  }
  return {
    type: 'move-few-on-change',
    stepMs: r.stepMs,
    ringSize: r.ringSize,
    servers,
    keys,
    removed: r.removed,
  };
}

/** FNV-1a 32비트(UTF-8 바이트) 뒤 fmix32 — 부호 없는 32비트. */
export function h32(s: string): number {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(s)) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** 링 자리 = floor(h32 × size / 2^32). 윗자리 비트를 쓴다. */
export function ringPos(s: string, size: number): number {
  return Math.floor((h32(s) * size) / 4294967296);
}

/** 자리 p 에서 수가 커지는 쪽으로 처음 만나는 서버. 없으면 가장 작은 자리로 감아 돈다. */
export function ringOwner(p: number, servers: readonly ServerBase[]): string {
  if (servers.length === 0) throw new Error('move-few-on-change: 링에 서버가 없다');
  const order = [...servers].sort((a, b) => a.pos - b.pos);
  for (const s of order) {
    if (s.pos >= p) return s.id;
  }
  return order[0]!.id;
}

export async function moveFewOnChange(context: FacetContext<MoveFewOnChangeFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<MoveFewOnChangeFacetData>;
  const data = narrowMoveFewData(ctx.data);
  const { stepMs, ringSize } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const servers: ServerBase[] = data.servers.map((id, index) => ({ id, pos: ringPos(id, ringSize), index }));
  const serverPositions = new Set<number>();
  for (const s of servers) {
    if (serverPositions.has(s.pos)) throw new Error(`move-few-on-change: 서버 ${s.id} 의 링 자리 ${s.pos} 가 겹친다`);
    serverPositions.add(s.pos);
  }
  const n0 = servers.length;
  const keys: KeyBase[] = data.keys.map((id) => {
    const pos = ringPos(id, ringSize);
    const modIndex = h32(id) % n0;
    const modOwner = data.servers[modIndex];
    if (modOwner === undefined) throw new Error(`move-few-on-change: 번호 ${modIndex} 의 서버가 없다`);
    return { id, pos, ringOwner: ringOwner(pos, servers), modIndex, modOwner };
  });

  const survivors = servers.filter((s) => s.id !== data.removed);
  const removedServer = servers.find((s) => s.id === data.removed);
  if (removedServer === undefined) throw new Error(`move-few-on-change: 빠질 서버 ${data.removed} 가 없다`);
  const successor = ringOwner((removedServer.pos + 1) % ringSize, survivors);
  const survivorIds = survivors.map((s) => s.id);
  const n1 = survivorIds.length;

  // 빠진 뒤의 주인 — 걸음마다 실어 보내고, 칸 높이(rows)도 여기서 나온다.
  const after = keys.map((k) => {
    const ringTo = ringOwner(k.pos, survivors);
    const modIndex = h32(k.id) % n1;
    const modTo = survivorIds[modIndex];
    if (modTo === undefined) throw new Error(`move-few-on-change: 남은 번호 ${modIndex} 의 서버가 없다`);
    return { k, ringTo, ringMoved: ringTo !== k.ringOwner, modIndex, modTo, modMoved: modTo !== k.modOwner };
  });
  let rows = 0;
  for (const s of servers) {
    const ringRows =
      keys.filter((k) => k.ringOwner === s.id).length + after.filter((a) => a.ringMoved && a.ringTo === s.id).length;
    const modRows =
      keys.filter((k) => k.modOwner === s.id).length + after.filter((a) => a.modMoved && a.modTo === s.id).length;
    rows = Math.max(rows, ringRows, modRows);
  }

  await ctx.emit({ type: 'init', payload: { ringSize, servers, keys, rows }, silent: true });

  // 걸음 0 은 두 쪽 배치가 이미 읽을 것이라 첫 발신 앞에 틈을 둔다.
  if (!(await pause())) return;

  await ctx.emit({
    type: 'remove',
    payload: { server: data.removed, successor, survivors: survivorIds },
  });

  let ringTally = 0;
  let modTally = 0;
  for (const a of after) {
    if (!(await pause())) return;
    const { k, ringTo, ringMoved, modIndex, modTo, modMoved } = a;
    if (ringMoved) ringTally += 1;
    if (modMoved) modTally += 1;
    await ctx.emit({
      type: 'place',
      payload: { key: k.id, ringTo, ringMoved, modIndex, modTo, modMoved, ringTally, modTally },
    });
  }
}
