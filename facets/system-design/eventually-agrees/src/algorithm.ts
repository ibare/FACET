/**
 * eventually-agrees — 리더 없이 따로 받은 쓰기들이 사본끼리의 주고받기로 한 값에 모인다.
 *
 * 데이터가 준 차례대로 일어나는 일을 하나씩 걷는다. 걸음 하나 = 쓰기 하나 / 주고받기 하나.
 * 주고받기는 두 사본이 서로의 (값, 도장)을 보고 **둘 다** 도장이 큰 쪽으로 맞춘다 (마지막 도장이 이긴다).
 * 도장이 같으면 사본 번호(`replicas` 의 차례)가 큰 쪽이 이긴다.
 *
 * 이벤트 (전부 algorithm 이 셈한 값을 싣는다):
 *
 *   init   (silent) — 걸음 0 의 셈. 서로 다른 값 목록.
 *     payload: { distinct: Version[] }
 *
 *   write  — 쓰기 하나가 한 사본에 떨어진다.
 *     payload: { at: string; value: number; stamp: number;
 *                was: { value: number; stamp: number };   // 덮이기 전 그 사본의 값
 *                last: boolean;                            // 데이터의 마지막 쓰기인가
 *                distinct: Version[] }
 *
 *   gossip — 두 사본이 값을 주고받는다.
 *     payload: { a: string; b: string; winner: string; loser: string;
 *                value: number; stamp: number;              // 이긴 값 — 둘 다 이 값이 된다
 *                loserWas: { value: number; stamp: number }; // 진 쪽이 들고 있던 값
 *                settling: boolean;                          // 마지막 쓰기 뒤인가
 *                holders: number;                            // 이긴 (값, 도장)을 주고받기 뒤에 든 사본 수
 *                distinct: Version[] }
 *
 *   Version = { value: number; stamp: number; holders: number } — 도장 오름차순
 *
 * 무작위 없음. 짝 · 도장 · 차례는 모두 데이터가 준다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ReplicaSpec = { id: string; value: number; stamp: number };
export type WriteSpec = { kind: 'write'; at: string; value: number; stamp: number };
export type GossipSpec = { kind: 'gossip'; a: string; b: string };
export type HappeningSpec = WriteSpec | GossipSpec;

export type EventuallyAgreesFacetData = {
  type: 'eventually-agrees';
  stepMs: number;
  key: string;
  replicas: ReplicaSpec[];
  happenings: HappeningSpec[];
};

export type Version = { value: number; stamp: number; holders: number };

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function num(x: unknown, path: string): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`eventually-agrees: ${path} 가 수가 아니다`);
  return x;
}

function str(x: unknown, path: string): string {
  if (typeof x !== 'string' || x.length === 0) throw new Error(`eventually-agrees: ${path} 가 빈 문자열이거나 문자열이 아니다`);
  return x;
}

/** 좁히개 — 모양을 검사하고 어긋나면 던진다. 알고리즘 · 장면 · 그림이 함께 쓴다. */
export function narrowEventuallyAgrees(raw: unknown): EventuallyAgreesFacetData {
  if (!isRecord(raw)) throw new Error('eventually-agrees: initialData 가 객체가 아니다');
  if (raw.type !== 'eventually-agrees') throw new Error(`eventually-agrees: type 이 다르다 (${String(raw.type)})`);
  const stepMs = num(raw.stepMs, 'stepMs');
  const key = str(raw.key, 'key');
  if (!Array.isArray(raw.replicas) || raw.replicas.length < 2) throw new Error('eventually-agrees: replicas 는 둘 이상의 배열이어야 한다');
  const ids = new Set<string>();
  const replicas: ReplicaSpec[] = raw.replicas.map((r: unknown, i: number) => {
    if (!isRecord(r)) throw new Error(`eventually-agrees: replicas[${i}] 가 객체가 아니다`);
    const id = str(r.id, `replicas[${i}].id`);
    if (ids.has(id)) throw new Error(`eventually-agrees: replicas[${i}].id 가 겹친다 (${id})`);
    ids.add(id);
    return { id, value: num(r.value, `replicas[${i}].value`), stamp: num(r.stamp, `replicas[${i}].stamp`) };
  });
  if (!Array.isArray(raw.happenings)) throw new Error('eventually-agrees: happenings 가 배열이 아니다');
  const happenings: HappeningSpec[] = raw.happenings.map((h: unknown, i: number) => {
    if (!isRecord(h)) throw new Error(`eventually-agrees: happenings[${i}] 가 객체가 아니다`);
    if (h.kind === 'write') {
      const at = str(h.at, `happenings[${i}].at`);
      if (!ids.has(at)) throw new Error(`eventually-agrees: happenings[${i}].at 사본이 없다 (${at})`);
      return { kind: 'write', at, value: num(h.value, `happenings[${i}].value`), stamp: num(h.stamp, `happenings[${i}].stamp`) };
    }
    if (h.kind === 'gossip') {
      const a = str(h.a, `happenings[${i}].a`);
      const b = str(h.b, `happenings[${i}].b`);
      if (!ids.has(a)) throw new Error(`eventually-agrees: happenings[${i}].a 사본이 없다 (${a})`);
      if (!ids.has(b)) throw new Error(`eventually-agrees: happenings[${i}].b 사본이 없다 (${b})`);
      if (a === b) throw new Error(`eventually-agrees: happenings[${i}] 가 제 자신과 주고받는다 (${a})`);
      return { kind: 'gossip', a, b };
    }
    throw new Error(`eventually-agrees: happenings[${i}].kind 를 모른다 (${String(h.kind)})`);
  });
  return { type: 'eventually-agrees', stepMs, key, replicas, happenings };
}

/**
 * 바탕에서 정해지는 판 목록 — 처음 값들과 쓰기들의 (값, 도장)을 도장 차례로.
 * 그림이 판마다 색을 고정하는 데 쓴다 (드러난 수가 아니라 데이터 전체로 정한다).
 */
export function versionStamps(data: EventuallyAgreesFacetData): number[] {
  const stamps = new Set<number>();
  for (const r of data.replicas) stamps.add(r.stamp);
  for (const h of data.happenings) if (h.kind === 'write') stamps.add(h.stamp);
  return [...stamps].sort((x, y) => x - y);
}

type Held = { value: number; stamp: number };

/** 서로 다른 값 — (값, 도장) 판마다 든 사본 수. 도장 오름차순. */
function distinctOf(order: string[], state: Map<string, Held>): Version[] {
  const byStamp = new Map<number, Version>();
  for (const id of order) {
    const h = state.get(id);
    if (!h) throw new Error(`eventually-agrees: 사본 ${id} 의 상태가 없다`);
    const v = byStamp.get(h.stamp);
    if (v) {
      if (v.value !== h.value) throw new Error(`eventually-agrees: 도장 ${h.stamp} 에 값이 둘이다`);
      v.holders += 1;
    } else {
      byStamp.set(h.stamp, { value: h.value, stamp: h.stamp, holders: 1 });
    }
  }
  return [...byStamp.values()].sort((x, y) => x.stamp - y.stamp);
}

export async function eventuallyAgrees(ctxBase: FacetContext<EventuallyAgreesFacetData>): Promise<void> {
  const ctx = ctxBase as ReactiveContext<EventuallyAgreesFacetData>;
  const data = narrowEventuallyAgrees(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const order = data.replicas.map((r) => r.id);
  const rank = new Map(order.map((id, i) => [id, i] as const));
  const state = new Map<string, Held>(data.replicas.map((r) => [r.id, { value: r.value, stamp: r.stamp }] as const));

  const writeStamps = data.happenings.flatMap((h) => (h.kind === 'write' ? [h.stamp] : []));
  if (new Set(writeStamps).size !== writeStamps.length) throw new Error('eventually-agrees: 쓰기의 도장이 겹친다');
  let lastWriteIndex = -1;
  data.happenings.forEach((h, i) => {
    if (h.kind === 'write') lastWriteIndex = i;
  });

  function rankOf(id: string): number {
    const r = rank.get(id);
    if (r === undefined) throw new Error(`eventually-agrees: 사본 ${id} 의 번호가 없다`);
    return r;
  }

  function held(id: string): Held {
    const h = state.get(id);
    if (!h) throw new Error(`eventually-agrees: 사본 ${id} 가 없다`);
    return h;
  }

  await ctx.emit({ type: 'init', payload: { distinct: distinctOf(order, state) }, silent: true });

  for (let i = 0; i < data.happenings.length; i += 1) {
    // 걸음 0 이 이미 사본 넷을 보여 주므로 첫 발신 앞에도 읽을 틈을 둔다.
    if (!(await pause())) return;
    const h = data.happenings[i]!;
    if (h.kind === 'write') {
      const was = held(h.at);
      state.set(h.at, { value: h.value, stamp: h.stamp });
      await ctx.emit({
        type: 'write',
        payload: {
          at: h.at,
          value: h.value,
          stamp: h.stamp,
          was: { value: was.value, stamp: was.stamp },
          last: i === lastWriteIndex,
          distinct: distinctOf(order, state),
        },
      });
    } else {
      const ha = held(h.a);
      const hb = held(h.b);
      let aWins: boolean;
      if (ha.stamp !== hb.stamp) aWins = ha.stamp > hb.stamp;
      else aWins = rankOf(h.a) > rankOf(h.b);
      const winner = aWins ? h.a : h.b;
      const loser = aWins ? h.b : h.a;
      const win = aWins ? ha : hb;
      const lose = aWins ? hb : ha;
      if (win.value === lose.value && win.stamp === lose.stamp) {
        throw new Error(`eventually-agrees: 주고받기 ${h.a} ↔ ${h.b} 가 아무것도 바꾸지 않는다 — 이 조각의 데이터는 헛된 주고받기를 두지 않는다`);
      }
      state.set(loser, { value: win.value, stamp: win.stamp });
      const distinct = distinctOf(order, state);
      const won = distinct.find((v) => v.stamp === win.stamp && v.value === win.value);
      if (!won) throw new Error(`eventually-agrees: 이긴 값 (도장 ${win.stamp}) 을 든 사본이 없다`);
      await ctx.emit({
        type: 'gossip',
        payload: {
          a: h.a,
          b: h.b,
          winner,
          loser,
          value: win.value,
          stamp: win.stamp,
          loserWas: { value: lose.value, stamp: lose.stamp },
          settling: lastWriteIndex >= 0 && i > lastWriteIndex,
          holders: won.holders,
          distinct,
        },
      });
    }
  }
}
