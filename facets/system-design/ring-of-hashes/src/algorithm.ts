/**
 * ring-of-hashes — 서버와 키가 제 해시로 고리 위 자리를 잡고, 키는 시계 방향으로 걸어
 * 처음 만나는 서버에 멈춘다.
 *
 * 해시 `h32(s)` = FNV-1a 32비트(UTF-8 바이트) 뒤에 murmur3 의 마무리 섞기(fmix32).
 * 고리 자리 = floor(h32 × size / 2^32) — 윗자리 비트를 쓴다.
 * 주인 = 키 자리 p 에서 자리 ≥ p 인 서버 가운데 가장 작은 자리. 없으면 가장 작은 자리의
 * 서버로 감아 돈다. 같은 자리면 그 서버.
 *
 * 이벤트 (silent 인 것은 없다 — 걸음 0 은 장면의 initial 이 initialData 에서 세운다)
 *
 *   server-place  서버 하나가 자리를 잡는다
 *     payload: { server: string; pos: number }
 *       server  서버 식별자 (initialData.servers 의 하나)
 *       pos     고리 위 자리 0..size-1
 *
 *   key-place     키 하나가 자리를 잡고 시계 방향으로 걸어 주인에게 닿는다
 *     payload: { key: string; pos: number; owner: string; dist: number; wrapped: boolean }
 *       key      키 식별자 (initialData.keys 의 하나)
 *       pos      키의 고리 위 자리
 *       owner    처음 만난 서버 식별자
 *       dist     시계 방향으로 걸은 칸 수 = (주인 자리 − pos) mod size
 *       wrapped  size−1 을 넘어 0 으로 감아 돌았는가 (주인 자리 < pos)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RingOfHashesFacetData = {
  type: 'ring-of-hashes';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  /** 고리의 자리 수 — 자리는 0..size-1 */
  size: number;
  /** 서버 식별자 — 해시 입력 그 자체. 자리를 잡는 차례도 이 차례 */
  servers: string[];
  /** 키 식별자 — 해시 입력 그 자체. 자리를 잡는 차례대로 */
  keys: string[];
};

function readIdList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`ring-of-hashes: ${field} 는 비지 않은 배열이어야 한다`);
  }
  const out: string[] = [];
  value.forEach((item, i) => {
    if (typeof item !== 'string' || item.length === 0) {
      throw new Error(`ring-of-hashes: ${field}[${i}] 는 비지 않은 문자열이어야 한다`);
    }
    if (out.includes(item)) {
      throw new Error(`ring-of-hashes: ${field}[${i}] "${item}" 가 겹친다`);
    }
    out.push(item);
  });
  return out;
}

/** 좁히개 — 알고리즘과 장면이 함께 부른다. 모양이 어긋나면 필드 경로를 담아 던진다. */
export function readRingData(raw: unknown): RingOfHashesFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('ring-of-hashes: 자료가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'ring-of-hashes') {
    throw new Error(`ring-of-hashes: type 이 "ring-of-hashes" 가 아니다 (${String(r.type)})`);
  }
  const { stepMs, size } = r;
  if (typeof stepMs !== 'number' || !Number.isFinite(stepMs) || stepMs < 0) {
    throw new Error('ring-of-hashes: stepMs 는 0 이상의 수여야 한다');
  }
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 2) {
    throw new Error('ring-of-hashes: size 는 2 이상의 정수여야 한다');
  }
  const servers = readIdList(r.servers, 'servers');
  const keys = readIdList(r.keys, 'keys');
  for (const k of keys) {
    if (servers.includes(k)) throw new Error(`ring-of-hashes: keys 의 "${k}" 가 서버 식별자와 같다`);
  }
  return { type: 'ring-of-hashes', stepMs, size, servers: [...servers], keys: [...keys] };
}

/** FNV-1a 32비트 뒤 murmur3 fmix32. 부호 없는 32비트 정수를 돌려준다. */
export function h32(s: string): number {
  const bytes = new TextEncoder().encode(s);
  let h = 0x811c9dc5;
  for (const b of bytes) {
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

/** 고리 위 자리 = floor(h × size / 2^32). h < 2^32 · size 가 작아 곱이 2^53 안이다. */
export function ringPos(s: string, size: number): number {
  return Math.floor((h32(s) * size) / 4294967296);
}

/** 자리 p 에서 시계 방향으로 처음 만나는 서버. 같은 자리면 그 서버, 끝을 넘으면 감아 돈다. */
export function ringOwner(p: number, placed: ReadonlyArray<{ id: string; pos: number }>): string {
  if (placed.length === 0) throw new Error('ring-of-hashes: 고리에 서버가 없다');
  const order = [...placed].sort((a, b) => a.pos - b.pos);
  for (const s of order) {
    if (s.pos >= p) return s.id;
  }
  const first = order[0];
  if (first === undefined) throw new Error('ring-of-hashes: 고리에 서버가 없다');
  return first.id;
}

export async function ringOfHashes(context: FacetContext<RingOfHashesFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<RingOfHashesFacetData>;
  const data = readRingData(ctx.data);
  const { stepMs, size } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const placed: { id: string; pos: number }[] = [];

  // 걸음 0 은 대기 중인 서버와 키가 이미 서 있는 화면이라 첫 발신 앞에도 읽을 틈을 둔다.
  for (const server of data.servers) {
    if (!(await pause())) return;
    const pos = ringPos(server, size);
    if (placed.some((s) => s.pos === pos)) {
      throw new Error(`ring-of-hashes: 서버 "${server}" 의 자리 ${pos} 에 이미 서버가 있다`);
    }
    placed.push({ id: server, pos });
    await ctx.emit({ type: 'server-place', payload: { server, pos } });
  }

  for (const key of data.keys) {
    if (!(await pause())) return;
    const pos = ringPos(key, size);
    const owner = ringOwner(pos, placed);
    const ownerSeat = placed.find((s) => s.id === owner);
    if (ownerSeat === undefined) throw new Error(`ring-of-hashes: 주인 "${owner}" 의 자리가 없다`);
    const dist = (((ownerSeat.pos - pos) % size) + size) % size;
    const wrapped = ownerSeat.pos < pos;
    await ctx.emit({ type: 'key-place', payload: { key, pos, owner, dist, wrapped } });
  }
}
