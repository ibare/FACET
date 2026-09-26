/**
 * happens-before — 램포트 시계. 벽시계 없이 사건마다 수가 오르고, 받을 때 실려 온 수 너머로 뛴다.
 * 마지막에 두 사건 짝을 묻는다: 화살표를 따라 잇는 길이 있는가.
 *
 * 규약
 *   - 프로세스마다 수 하나, 처음 0.
 *   - 제 일 · 보내기 = 수 + 1. 보내기는 올린 수를 메시지에 싣는다.
 *   - 받기 = max(제 수, 실려 온 수) + 1.
 *   - happens-before: 같은 프로세스 안 앞 → 뒤, 보내기 → 그 메시지의 받기, 그리고 둘을 이어 붙인 것.
 *   - 같은 수(동률)는 깨지 않는다 — 전체 순서를 만들지 않는다.
 *   - 일어난 차례(`order`)는 보기 위한 차례일 뿐 프로세스들이 아는 것이 아니다.
 *
 * 이벤트 (발신 차례대로)
 *   init    silent  { clocks: { process: string; n: number }[]; top: number }
 *                   처음 수(모두 0)와 사다리 꼭대기(가장 큰 수). 걸음 0 을 채운다.
 *   local           { event: string; process: string; from: number; to: number }
 *   send            { event: string; process: string; from: number; to: number;
 *                     message: string; receiver: string }          실린 수 = to
 *   receive         { event: string; process: string; from: number; to: number;
 *                     message: string; sender: string; carried: number }
 *                   sender 는 보낸 사건 id, to = max(from, carried) + 1
 *   ask             { a: string; b: string; na: number; nb: number;
 *                     forward: string[] | null; backward: string[] | null }
 *                   forward 는 a 에서 b 로 잇는 길(사건 id 차례), backward 는 b 에서 a 로. 없으면 null.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type HbEventKind = 'local' | 'send' | 'receive';

export type HbEventDef = {
  id: string;
  process: string;
  kind: HbEventKind;
  /** send · receive 의 메시지 id */
  message: string | null;
  /** send 가 보내는 프로세스 */
  to: string | null;
};

export type HappensBeforeFacetData = {
  type: 'happens-before';
  stepMs: number;
  processes: string[];
  events: HbEventDef[];
  /** 일어난 차례 — 한 걸음에 한 사건 */
  order: string[];
  /** 마지막에 묻는 짝 */
  asks: [string, string][];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function stringArray(v: unknown, path: string): string[] {
  if (!Array.isArray(v)) throw new Error(`happens-before: ${path} 는 배열이어야 한다`);
  return v.map((x, i) => {
    if (typeof x !== 'string' || x === '') throw new Error(`happens-before: ${path}[${i}] 는 빈 칸 아닌 문자열이어야 한다`);
    return x;
  });
}

/** 자료 좁히개 — 알고리즘과 장면이 함께 부른다. 어긋나면 던진다. */
export function narrowHappensBeforeData(raw: unknown): HappensBeforeFacetData {
  if (!isRecord(raw)) throw new Error('happens-before: initialData 가 없다');
  if (raw.type !== 'happens-before') throw new Error(`happens-before: type 이 다르다 (${String(raw.type)})`);
  const stepMs = raw.stepMs;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) throw new Error('happens-before: stepMs 는 양수여야 한다');

  const processes = stringArray(raw.processes, 'processes');
  if (processes.length === 0) throw new Error('happens-before: processes 가 비었다');
  if (new Set(processes).size !== processes.length) throw new Error('happens-before: processes 에 겹친 id');

  if (!Array.isArray(raw.events)) throw new Error('happens-before: events 는 배열이어야 한다');
  const events: HbEventDef[] = raw.events.map((e, i) => {
    if (!isRecord(e)) throw new Error(`happens-before: events[${i}] 모양이 틀렸다`);
    const { id, process, kind } = e;
    if (typeof id !== 'string' || id === '') throw new Error(`happens-before: events[${i}].id`);
    if (typeof process !== 'string' || !processes.includes(process)) {
      throw new Error(`happens-before: events[${i}].process 가 processes 에 없다 (${String(process)})`);
    }
    if (kind !== 'local' && kind !== 'send' && kind !== 'receive') {
      throw new Error(`happens-before: events[${i}].kind 를 모른다 (${String(kind)})`);
    }
    if (kind === 'local') {
      if (e.message !== undefined || e.to !== undefined) throw new Error(`happens-before: events[${i}] 제 일에 message · to 가 있다`);
      return { id, process, kind, message: null, to: null };
    }
    if (typeof e.message !== 'string' || e.message === '') throw new Error(`happens-before: events[${i}].message`);
    if (kind === 'send') {
      if (typeof e.to !== 'string' || !processes.includes(e.to) || e.to === process) {
        throw new Error(`happens-before: events[${i}].to 가 다른 프로세스가 아니다 (${String(e.to)})`);
      }
      return { id, process, kind, message: e.message, to: e.to };
    }
    if (e.to !== undefined) throw new Error(`happens-before: events[${i}] 받기에 to 가 있다`);
    return { id, process, kind, message: e.message, to: null };
  });
  const ids = events.map((e) => e.id);
  if (new Set(ids).size !== ids.length) throw new Error('happens-before: events 에 겹친 id');

  // 메시지마다 보내기 하나 · 받기 하나, 받는 쪽이 맞아야 한다.
  for (const e of events) {
    if (e.kind === 'local') continue;
    const sends = events.filter((x) => x.kind === 'send' && x.message === e.message);
    const recvs = events.filter((x) => x.kind === 'receive' && x.message === e.message);
    if (sends.length !== 1 || recvs.length !== 1) {
      throw new Error(`happens-before: 메시지 ${String(e.message)} 의 보내기 · 받기가 하나씩이 아니다`);
    }
    if (sends[0]!.to !== recvs[0]!.process) {
      throw new Error(`happens-before: 메시지 ${String(e.message)} 를 받는 프로세스가 보낸 곳과 다르다`);
    }
  }

  const order = stringArray(raw.order, 'order');
  if (new Set(order).size !== order.length) throw new Error('happens-before: order 에 같은 사건이 두 번 있다');
  if (order.length !== ids.length || !order.every((id) => ids.includes(id))) {
    throw new Error('happens-before: order 는 events 를 하나씩 모두 담아야 한다');
  }

  if (!Array.isArray(raw.asks)) throw new Error('happens-before: asks 는 배열이어야 한다');
  const asks = raw.asks.map((pair, i): [string, string] => {
    const [a, b] = stringArray(pair, `asks[${i}]`);
    if (a === undefined || b === undefined || (pair as unknown[]).length !== 2) throw new Error(`happens-before: asks[${i}] 는 짝이어야 한다`);
    if (!ids.includes(a) || !ids.includes(b) || a === b) throw new Error(`happens-before: asks[${i}] 가 서로 다른 두 사건이 아니다`);
    return [a, b];
  });

  return {
    type: 'happens-before',
    stepMs,
    processes: [...processes],
    events: events.map((e) => ({ ...e })),
    order: [...order],
    asks,
  };
}

export type LamportStep =
  | { kind: 'local'; event: string; process: string; from: number; to: number }
  | { kind: 'send'; event: string; process: string; from: number; to: number; message: string; receiver: string }
  | {
      kind: 'receive';
      event: string;
      process: string;
      from: number;
      to: number;
      message: string;
      sender: string;
      carried: number;
    };

function eventOf(data: HappensBeforeFacetData, id: string): HbEventDef {
  const e = data.events.find((x) => x.id === id);
  if (!e) throw new Error(`happens-before: 사건 ${id} 가 events 에 없다`);
  return e;
}

/** 일어난 차례대로 램포트 수를 셈한다. 받기가 보내기보다 먼저면 던진다. */
export function lamportRun(data: HappensBeforeFacetData): LamportStep[] {
  const clock = new Map<string, number>(data.processes.map((p) => [p, 0]));
  const sent = new Map<string, { event: string; n: number }>();
  const out: LamportStep[] = [];
  for (const id of data.order) {
    const e = eventOf(data, id);
    const from = clock.get(e.process);
    if (from === undefined) throw new Error(`happens-before: 프로세스 ${e.process} 의 수가 없다`);
    if (e.kind === 'receive') {
      const m = e.message === null ? undefined : sent.get(e.message);
      if (!m) throw new Error(`happens-before: ${id} 가 받는 메시지가 아직 보내지지 않았다`);
      const to = Math.max(from, m.n) + 1;
      clock.set(e.process, to);
      out.push({ kind: 'receive', event: id, process: e.process, from, to, message: e.message!, sender: m.event, carried: m.n });
    } else if (e.kind === 'send') {
      const to = from + 1;
      clock.set(e.process, to);
      sent.set(e.message!, { event: id, n: to });
      out.push({ kind: 'send', event: id, process: e.process, from, to, message: e.message!, receiver: e.to! });
    } else {
      const to = from + 1;
      clock.set(e.process, to);
      out.push({ kind: 'local', event: id, process: e.process, from, to });
    }
  }
  return out;
}

/** happens-before 의 곧은 화살표: 같은 프로세스 안 이웃한 두 사건, 보내기 → 받기. */
export function happensBeforeEdges(data: HappensBeforeFacetData): [string, string][] {
  const edges: [string, string][] = [];
  for (const p of data.processes) {
    const mine = data.order.filter((id) => eventOf(data, id).process === p);
    for (let i = 0; i + 1 < mine.length; i += 1) edges.push([mine[i]!, mine[i + 1]!]);
  }
  for (const e of data.events) {
    if (e.kind !== 'receive') continue;
    const s = data.events.find((x) => x.kind === 'send' && x.message === e.message);
    if (!s) throw new Error(`happens-before: ${e.id} 의 보내기가 없다`);
    edges.push([s.id, e.id]);
  }
  return edges.sort((x, y) => (x[0] + ' ' + x[1] < y[0] + ' ' + y[1] ? -1 : 1));
}

/** 화살표를 따라 a 에서 b 로 가는 가장 짧은 길. 없으면 null. */
export function findPath(edges: [string, string][], a: string, b: string): string[] | null {
  const seen = new Set<string>([a]);
  let frontier: string[][] = [[a]];
  while (frontier.length > 0) {
    const next: string[][] = [];
    for (const route of frontier) {
      const last = route[route.length - 1]!;
      if (last === b) return route;
      for (const [x, y] of edges) {
        if (x !== last || seen.has(y)) continue;
        seen.add(y);
        next.push([...route, y]);
      }
    }
    frontier = next;
  }
  return null;
}

export async function happensBefore(context: FacetContext<HappensBeforeFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<HappensBeforeFacetData>;
  const data = narrowHappensBeforeData(ctx.data);
  const { stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const steps = lamportRun(data);
  const number = new Map<string, number>(steps.map((s) => [s.event, s.to]));
  const top = Math.max(...steps.map((s) => s.to));

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { clocks: data.processes.map((process) => ({ process, n: 0 })), top },
  });

  // 걸음 0 에 세 프로세스가 이미 서 있으므로 첫 사건 앞에도 한 번 머문다.
  for (const s of steps) {
    if (!(await pause())) return;
    if (s.kind === 'local') {
      await ctx.emit({
        type: 'local',
        payload: { event: s.event, process: s.process, from: s.from, to: s.to },
      });
    } else if (s.kind === 'send') {
      await ctx.emit({
        type: 'send',
        payload: {
          event: s.event,
          process: s.process,
          from: s.from,
          to: s.to,
          message: s.message,
          receiver: s.receiver,
        },
      });
    } else {
      await ctx.emit({
        type: 'receive',
        payload: {
          event: s.event,
          process: s.process,
          from: s.from,
          to: s.to,
          message: s.message,
          sender: s.sender,
          carried: s.carried,
        },
      });
    }
  }

  const edges = happensBeforeEdges(data);
  for (const [a, b] of data.asks) {
    if (!(await pause())) return;
    const na = number.get(a);
    const nb = number.get(b);
    if (na === undefined || nb === undefined) throw new Error(`happens-before: 묻는 짝 ${a} · ${b} 의 수가 없다`);
    await ctx.emit({
      type: 'ask',
      payload: { a, b, na, nb, forward: findPath(edges, a, b), backward: findPath(edges, b, a) },
    });
  }
}
