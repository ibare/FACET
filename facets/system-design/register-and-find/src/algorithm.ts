/**
 * register-and-find — 인스턴스가 스스로 등록부에 올라오고, 조용해진 줄은 등록부가 스스로 지운다.
 *
 * 걸음 하나 = 틱 하나. 같은 틱 안의 차례는 (1) 멈춤 (2) 등록 · 하트비트 (인스턴스 목록 차례)
 * (3) 만료 검사 (4) 조회. 조회가 받는 명단은 등록된 차례 그대로다 — 고르지 않는다.
 *
 * 이벤트 (발신 차례대로):
 *
 * - `init` (silent: true) — 셈으로 나오는 바탕. 걸음 0 을 갈아 끼운다.
 *     payload: { axisEnd: number }   // 임대 끝이 닿을 수 있는 가장 늦은 틱 = lastTick + ttl
 *
 * - `tick` (silent 아님, 틱마다 하나) — 그 틱에 일어난 것 전부.
 *     payload: { now: number; happenings: Happening[] }
 *     Happening =
 *       | { kind: 'stop'; id: string; last: number }                         // 인스턴스 쪽 사건. last 는 등록부가 마지막으로 들은 틱
 *       | { kind: 'register'; id: string; last: number; end: number }       // last = now, end = now + ttl
 *       | { kind: 'heartbeat'; id: string; from: number; last: number; end: number } // from = 앞서 들은 틱
 *       | { kind: 'expire'; id: string; last: number; quiet: number }       // quiet = now − last (≥ ttl)
 *       | { kind: 'lookup'; service: string; entries: { id: string; addr: string; stopped: boolean }[] }
 *
 * `ctx.metric` 은 부르지 않는다. 화면 문안은 싣지 않는다 — 종류와 인자만.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RegisterAndFindInstance = {
  /** 식별자 — 번역하지 않는 자료 */
  id: string;
  /** 주소 — 번역하지 않는 자료 */
  addr: string;
  /** 등록하는 틱 */
  register: number;
  /** 멈추는 틱. null 이면 끝까지 산다 */
  stop: number | null;
};

export type RegisterAndFindFacetData = {
  type: 'register-and-find';
  /** 서비스 이름 — 번역하지 않는 자료 */
  service: string;
  instances: RegisterAndFindInstance[];
  /** 하트비트 간격 (틱) */
  interval: number;
  /** 마지막으로 들은 뒤 이만큼 조용하면 지운다 (now − last ≥ ttl) */
  ttl: number;
  /** 부르는 쪽이 묻는 틱 */
  lookups: number[];
  /** 재생의 마지막 틱 (0 부터) */
  lastTick: number;
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

export type LookupEntry = { id: string; addr: string; stopped: boolean };

export type Happening =
  | { kind: 'stop'; id: string; last: number }
  | { kind: 'register'; id: string; last: number; end: number }
  | { kind: 'heartbeat'; id: string; from: number; last: number; end: number }
  | { kind: 'expire'; id: string; last: number; quiet: number }
  | { kind: 'lookup'; service: string; entries: LookupEntry[] };

function fail(path: string, why: string): never {
  throw new Error(`register-and-find: ${path} — ${why}`);
}

function wholeAtLeast(v: unknown, min: number, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min) fail(path, `${min} 이상의 정수가 아니다`);
  return v;
}

function nonEmpty(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) fail(path, '빈 문자열이거나 문자열이 아니다');
  return v;
}

/** `initialData` 좁히개 — 모양이 어긋나면 던진다. 알고리즘 · 장면 · 그림이 함께 쓴다. */
export function narrowRegisterAndFindData(raw: unknown): RegisterAndFindFacetData {
  if (typeof raw !== 'object' || raw === null) fail('initialData', '객체가 아니다');
  const o = raw as Record<string, unknown>;
  if (o.type !== 'register-and-find') fail('initialData.type', "'register-and-find' 가 아니다");
  const service = nonEmpty(o.service, 'initialData.service');
  const interval = wholeAtLeast(o.interval, 1, 'initialData.interval');
  const ttl = wholeAtLeast(o.ttl, 1, 'initialData.ttl');
  const lastTick = wholeAtLeast(o.lastTick, 0, 'initialData.lastTick');
  const stepMs = wholeAtLeast(o.stepMs, 1, 'initialData.stepMs');
  if (!Array.isArray(o.instances) || o.instances.length === 0) fail('initialData.instances', '빈 배열이거나 배열이 아니다');
  const seen = new Set<string>();
  const instances = o.instances.map((item: unknown, i): RegisterAndFindInstance => {
    const path = `initialData.instances[${i}]`;
    if (typeof item !== 'object' || item === null) fail(path, '객체가 아니다');
    const r = item as Record<string, unknown>;
    const id = nonEmpty(r.id, `${path}.id`);
    if (seen.has(id)) fail(`${path}.id`, `식별자 ${id} 가 겹친다`);
    seen.add(id);
    const addr = nonEmpty(r.addr, `${path}.addr`);
    const register = wholeAtLeast(r.register, 0, `${path}.register`);
    if (register > lastTick) fail(`${path}.register`, '재생 범위 밖이다');
    let stop: number | null;
    if (r.stop === null) stop = null;
    else {
      stop = wholeAtLeast(r.stop, 0, `${path}.stop`);
      // 등록 전에 멈추거나 등록과 같은 틱에 멈추는 차례는 사양이 말하지 않는다
      if (stop <= register) fail(`${path}.stop`, '등록 틱보다 늦지 않다');
    }
    return { id, addr, register, stop };
  });
  if (!Array.isArray(o.lookups)) fail('initialData.lookups', '배열이 아니다');
  const lookups = o.lookups.map((v: unknown, i) => {
    const n = wholeAtLeast(v, 0, `initialData.lookups[${i}]`);
    if (n > lastTick) fail(`initialData.lookups[${i}]`, '재생 범위 밖이다');
    return n;
  });
  for (let i = 1; i < lookups.length; i += 1) {
    if (lookups[i]! <= lookups[i - 1]!) fail(`initialData.lookups[${i}]`, '오름차순이 아니거나 겹친다');
  }
  return { type: 'register-and-find', service, instances, interval, ttl, lookups, lastTick, stepMs };
}

/**
 * 한 틱을 셈한다. `registry` (id → 마지막으로 들은 틱, 삽입 차례 = 등록 차례) 와 `stopped` 를 고친다.
 * 사양이 말하지 않은 상태(산 인스턴스의 만료 · 등록 전의 하트비트)를 만나면 던진다.
 */
function tickOnce(
  data: RegisterAndFindFacetData,
  now: number,
  registry: Map<string, number>,
  stopped: Set<string>,
): Happening[] {
  const out: Happening[] = [];
  // (1) 멈춤 — 등록부에는 아무것도 오지 않는다
  for (const inst of data.instances) {
    if (inst.stop !== now) continue;
    const last = registry.get(inst.id);
    if (last === undefined) fail(`tick ${now}`, `멈추는 ${inst.id} 가 등록부에 없다 — 사양이 말하지 않은 차례`);
    stopped.add(inst.id);
    out.push({ kind: 'stop', id: inst.id, last });
  }
  // (2) 등록 · 하트비트 — 인스턴스 목록 차례
  for (const inst of data.instances) {
    if (stopped.has(inst.id)) continue;
    if (now === inst.register) {
      if (registry.has(inst.id)) fail(`tick ${now}`, `${inst.id} 가 이미 등록되어 있다`);
      registry.set(inst.id, now);
      out.push({ kind: 'register', id: inst.id, last: now, end: now + data.ttl });
    } else if (now > inst.register && (now - inst.register) % data.interval === 0) {
      const from = registry.get(inst.id);
      if (from === undefined) fail(`tick ${now}`, `하트비트를 보내는 ${inst.id} 가 등록부에 없다`);
      registry.set(inst.id, now);
      out.push({ kind: 'heartbeat', id: inst.id, from, last: now, end: now + data.ttl });
    }
  }
  // (3) 만료 — 등록부는 조용함만 본다
  for (const [id, last] of [...registry]) {
    if (now - last < data.ttl) continue;
    if (!stopped.has(id)) fail(`tick ${now}`, `산 인스턴스 ${id} 가 만료된다 — 간격과 만료가 맞지 않는다`);
    registry.delete(id);
    out.push({ kind: 'expire', id, last, quiet: now - last });
  }
  // (4) 조회 — 그 순간의 명단, 등록된 차례
  if (data.lookups.includes(now)) {
    const entries = [...registry.keys()].map((id): LookupEntry => {
      const inst = data.instances.find((x) => x.id === id);
      if (!inst) fail(`tick ${now}`, `등록부의 ${id} 가 인스턴스 목록에 없다`);
      return { id, addr: inst.addr, stopped: stopped.has(id) };
    });
    out.push({ kind: 'lookup', service: data.service, entries });
  }
  return out;
}

export async function registerAndFind(ctx: FacetContext<RegisterAndFindFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<RegisterAndFindFacetData>;
  const data = narrowRegisterAndFindData(ctx.data);

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(data.stepMs)) && !rctx.cancelled;
  }

  await ctx.emit({ type: 'init', silent: true, payload: { axisEnd: data.lastTick + data.ttl } });

  const registry = new Map<string, number>();
  const stopped = new Set<string>();
  for (let now = 0; now <= data.lastTick; now += 1) {
    // 걸음 0(빈 등록부 · 안 뜬 인스턴스 셋)에도 읽을 틈을 준다
    if (!(await pause())) return;
    const happenings = tickOnce(data, now, registry, stopped);
    await ctx.emit({ type: 'tick', payload: { now, happenings } });
  }
}
