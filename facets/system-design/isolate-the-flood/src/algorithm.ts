/**
 * isolate-the-flood — 벌크헤드. 스레드 풀을 서비스마다 칸으로 나눠 두면, 멎은 서비스로
 * 가는 호출이 제 칸을 붙들어 채워도 옆 칸의 호출은 계속 스레드를 잡는다.
 *
 * 모형
 *   - 시각의 단위는 틱. 걸음 하나 = 틱 하나
 *   - 한 틱 안의 차례: ① 이 틱에 돌아오는 호출이 스레드를 놓는다(붙든 차례대로)
 *     ② 도착을 적힌 차례대로 받는다 — 대상 칸에 빈 스레드가 있으면 번호가 가장 낮은 것을 잡고,
 *     없으면 곧바로 "자리 없음" 으로 돌려보낸다(기다리지 않는다). 칸 사이에 빌려주지 않는다
 *   - 서비스의 `returnsAfter` 가 null 이면 멎은 것 — 호출이 돌아오지 않는다
 *   - 호출 식별자는 대상마다 온 차례로 `<대상><번호>` (a1 · a2 · … · b1 · …)
 *   - 멈추는 틱: 마지막 도착 틱을 지나고 돌아올 호출이 더는 없는 틱
 *
 * 이벤트 (걸음 0 은 장면의 `initial` 이 initialData 에서 세운다)
 *   tick   (silent 아님) 틱 하나.
 *          payload: {
 *            tick: number,
 *            returned: { call: string, bay: string, slot: number }[],   // 놓은 차례
 *            arrivals: { call: string, bay: string,
 *                        outcome: 'held' | 'away', slot: number | null }[], // 받은 차례
 *            say: { kind: 'fill' | 'full' | 'reject' | 'flow' | 'last',
 *                   stalled: string, other: string }                   // 캡션 종류와 인자
 *          }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type IsolateTheFloodBay = { id: string; size: number };
export type IsolateTheFloodService = { id: string; returnsAfter: number | null };
export type IsolateTheFloodArrival = { tick: number; to: string };

export type IsolateTheFloodFacetData = {
  type: 'isolate-the-flood';
  stepMs: number;
  bays: IsolateTheFloodBay[];
  services: IsolateTheFloodService[];
  arrivals: IsolateTheFloodArrival[];
};

export type IsolateTheFloodSayKind = 'fill' | 'full' | 'reject' | 'flow' | 'last';
export const SAY_KINDS: readonly IsolateTheFloodSayKind[] = ['fill', 'full', 'reject', 'flow', 'last'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/** initialData 좁히개. 모양이 어긋나면 필드 경로를 담아 던진다 — 장면의 initial 도 이것을 부른다. */
export function narrowIsolateTheFlood(raw: unknown): IsolateTheFloodFacetData {
  if (!isRecord(raw)) throw new Error('isolate-the-flood: initialData 가 객체가 아니다');
  if (raw.type !== 'isolate-the-flood') throw new Error(`isolate-the-flood: type 이 다르다 (${String(raw.type)})`);
  const stepMs = raw.stepMs;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) throw new Error('isolate-the-flood: stepMs 가 양수가 아니다');

  if (!Array.isArray(raw.bays) || raw.bays.length === 0) throw new Error('isolate-the-flood: bays 가 비었다');
  const bays: IsolateTheFloodBay[] = raw.bays.map((b: unknown, i: number) => {
    if (!isRecord(b) || typeof b.id !== 'string' || b.id === '') throw new Error(`isolate-the-flood: bays[${i}].id 가 없다`);
    if (!isCount(b.size) || b.size === 0) throw new Error(`isolate-the-flood: bays[${i}].size 가 양의 정수가 아니다`);
    return { id: b.id, size: b.size };
  });
  const bayIds = new Set(bays.map((b) => b.id));
  if (bayIds.size !== bays.length) throw new Error('isolate-the-flood: bays 의 id 가 겹친다');

  if (!Array.isArray(raw.services)) throw new Error('isolate-the-flood: services 가 배열이 아니다');
  const services: IsolateTheFloodService[] = raw.services.map((s: unknown, i: number) => {
    if (!isRecord(s) || typeof s.id !== 'string') throw new Error(`isolate-the-flood: services[${i}].id 가 없다`);
    const r = s.returnsAfter;
    if (r !== null && (!isCount(r) || r === 0)) {
      throw new Error(`isolate-the-flood: services[${i}].returnsAfter 는 null 이거나 양의 정수여야 한다`);
    }
    if (!bayIds.has(s.id)) throw new Error(`isolate-the-flood: services[${i}].id(${s.id}) 의 칸이 없다`);
    return { id: s.id, returnsAfter: r };
  });
  if (services.length !== bays.length || new Set(services.map((s) => s.id)).size !== services.length) {
    throw new Error('isolate-the-flood: 칸 하나에 서비스 하나여야 한다');
  }

  if (!Array.isArray(raw.arrivals) || raw.arrivals.length === 0) throw new Error('isolate-the-flood: arrivals 가 비었다');
  let last = 0;
  const arrivals: IsolateTheFloodArrival[] = raw.arrivals.map((a: unknown, i: number) => {
    if (!isRecord(a) || !isCount(a.tick)) throw new Error(`isolate-the-flood: arrivals[${i}].tick 이 0 이상의 정수가 아니다`);
    if (typeof a.to !== 'string' || !bayIds.has(a.to)) throw new Error(`isolate-the-flood: arrivals[${i}].to 의 칸이 없다`);
    if (a.tick < last) throw new Error(`isolate-the-flood: arrivals[${i}].tick 이 앞 도착보다 이르다`);
    last = a.tick;
    return { tick: a.tick, to: a.to };
  });

  return { type: 'isolate-the-flood', stepMs, bays, services, arrivals };
}

type Busy = { call: string; bay: string; slot: number; until: number | null };

export async function isolateTheFlood(context: FacetContext<IsolateTheFloodFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<IsolateTheFloodFacetData>;
  const data = narrowIsolateTheFlood(ctx.data);
  const { stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const stalledIds = data.services.filter((s) => s.returnsAfter === null).map((s) => s.id);
  const otherIds = data.services.filter((s) => s.returnsAfter !== null).map((s) => s.id);
  if (stalledIds.length !== 1 || otherIds.length !== 1) {
    throw new Error('isolate-the-flood: 멎은 서비스 하나와 도는 서비스 하나여야 캡션을 정할 수 있다');
  }
  const stalled = stalledIds[0] as string;
  const other = otherIds[0] as string;

  const returnsAfter = new Map(data.services.map((s) => [s.id, s.returnsAfter] as const));
  const slots = new Map(data.bays.map((b) => [b.id, new Array<string | null>(b.size).fill(null)] as const));
  const counts = new Map<string, number>(data.bays.map((b) => [b.id, 0] as const));
  const lastArrival = data.arrivals[data.arrivals.length - 1]!.tick;
  let busy: Busy[] = [];
  let next = 0;

  function slotsOf(bay: string): (string | null)[] {
    const s = slots.get(bay);
    if (!s) throw new Error(`isolate-the-flood: 칸 ${bay} 가 없다`);
    return s;
  }

  for (let tick = 0; ; tick += 1) {
    // 걸음 0 이 이미 읽을 화면(칸 둘 · 빈 스레드 여섯)이라 첫 틱 앞에도 문을 둔다
    if (!(await pause())) return;

    // ① 돌아오는 호출이 스레드를 놓는다
    const returned: { call: string; bay: string; slot: number }[] = [];
    const stay: Busy[] = [];
    for (const b of busy) {
      if (ctx.cancelled) return;
      if (b.until === tick) {
        const s = slotsOf(b.bay);
        if (s[b.slot] !== b.call) throw new Error(`isolate-the-flood: 틱 ${tick} — ${b.call} 가 붙든 스레드가 어긋났다`);
        s[b.slot] = null;
        returned.push({ call: b.call, bay: b.bay, slot: b.slot });
      } else {
        stay.push(b);
      }
    }
    busy = stay;

    // ② 도착을 적힌 차례대로 받는다
    const arrivals: { call: string; bay: string; outcome: 'held' | 'away'; slot: number | null }[] = [];
    while (next < data.arrivals.length && data.arrivals[next]!.tick === tick) {
      if (ctx.cancelled) return;
      const a = data.arrivals[next]!;
      next += 1;
      const n = (counts.get(a.to) as number) + 1;
      counts.set(a.to, n);
      const call = `${a.to}${n}`;
      const s = slotsOf(a.to);
      const free = s.indexOf(null);
      if (free === -1) {
        arrivals.push({ call, bay: a.to, outcome: 'away', slot: null });
        continue;
      }
      s[free] = call;
      const r = returnsAfter.get(a.to);
      if (r === undefined) throw new Error(`isolate-the-flood: 서비스 ${a.to} 가 없다`);
      busy.push({ call, bay: a.to, slot: free, until: r === null ? null : tick + r });
      arrivals.push({ call, bay: a.to, outcome: 'held', slot: free });
    }

    // 불변식: 칸 점유 ≤ 칸 크기 (배열 길이가 크기라 넘칠 수 없지만, 붙든 목록과 맞는지 본다)
    for (const bay of data.bays) {
      const used = slotsOf(bay.id).filter((c) => c !== null).length;
      const held = busy.filter((b) => b.bay === bay.id).length;
      if (used !== held || used > bay.size) throw new Error(`isolate-the-flood: 틱 ${tick} — 칸 ${bay.id} 의 점유가 어긋났다`);
    }

    // 캡션 종류 — 이 틱에 일어난 일에서 고른다
    const heldStalled = arrivals.filter((a) => a.bay === stalled && a.outcome === 'held').length;
    const awayStalled = arrivals.filter((a) => a.bay === stalled && a.outcome === 'away').length;
    const heldOther = arrivals.filter((a) => a.bay === other && a.outcome === 'held').length;
    const awayOther = arrivals.filter((a) => a.bay === other && a.outcome === 'away').length;
    const stalledFull = !slotsOf(stalled).includes(null);
    let kind: IsolateTheFloodSayKind;
    if (awayOther > 0) {
      throw new Error(`isolate-the-flood: 틱 ${tick} — 도는 칸 ${other} 의 자리 없음을 말할 캡션이 없다`);
    } else if (arrivals.length === 0 && stalledFull) {
      kind = 'last';
    } else if (heldStalled > 0 && awayStalled === 0) {
      kind = 'fill';
    } else if (heldStalled > 0 && awayStalled > 0) {
      kind = 'full';
    } else if (awayStalled > 0 && heldOther > 0) {
      kind = 'reject';
    } else if (awayStalled === 0 && heldOther > 0) {
      kind = 'flow';
    } else {
      throw new Error(`isolate-the-flood: 틱 ${tick} — 이 틱의 일에 맞는 캡션 종류가 없다`);
    }

    await ctx.emit({
      type: 'tick',
      payload: { tick, returned, arrivals, say: { kind, stalled, other } },
    });

    const pending = busy.some((b) => b.until !== null);
    if (tick >= lastArrival && !pending) return;
  }
}
