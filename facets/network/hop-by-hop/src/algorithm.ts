/**
 * hop-by-hop — 한 줄로 이은 마디 위를 패킷들이 틱마다 한 칸씩 나아간다.
 *
 * 규약 (실제 망과 어긋나게 줄인 자리 — 설명 글이 밝힌다)
 *   - 한 틱 = 패킷 하나를 한 링크에 다 싣는 시간. 링크의 속도는 모두 같다.
 *   - 전파 지연 0 · 처리 지연 0 · 줄 설 자리는 넉넉하다.
 *   - 틱 t 동안 링크 (i → i+1) 는 마디 i 가 틱 t 가 시작하기 전에 온전히 가진 패킷
 *     가운데 번호가 가장 작은 것 하나를 나른다. 틱 t 에 받은 패킷은 틱 t+1 부터 넘긴다.
 *   - 한 틱의 옮김은 모두 동시다 — 틱 시작 때의 자리로 정하고 한꺼번에 옮긴다.
 *   - 길은 한 줄뿐이라 고를 것이 없다. 라우팅 표 · 다음 홉 · TTL 은 다루지 않는다.
 *   - 모든 패킷은 첫 마디에서 출발해 끝 마디로 간다.
 *
 * 이벤트
 *   init  (silent)  { tickCount: number }
 *     셈으로 얻은 전체 틱 수. 걸음 0 을 갈아 끼울 뿐 걸음을 늘리지 않는다.
 *   tick            { t: number; moves: { packet: number; from: number; to: number }[]; last: boolean }
 *     틱 t 에 일어난 옮김 전부. packet 은 initialData.packets 의 번호, from · to 는
 *     initialData.nodes 의 번호 (to = from + 1). last 는 이 틱으로 모두 닿았는가.
 *
 * 걸음 = 틱 하나. 걸음 0 은 틱 0 (모두 첫 마디에 있다).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type HopByHopFacetData = {
  type: 'hop-by-hop';
  /** 한 줄로 이은 마디. 이웃끼리 링크 하나로 이어진다 */
  nodes: string[];
  /** 나눈 패킷. 번호가 작을수록 먼저 넘긴다 */
  packets: string[];
  stepMs: number;
};

export type HopMove = { packet: number; from: number; to: number };
export type HopTick = { t: number; moves: HopMove[] };

/** 자료를 좁힌다. 모양이 틀리면 던진다 — 지어내지 않는다. */
export function readHopByHopData(raw: unknown): HopByHopFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('hop-by-hop: 자료가 객체가 아니다');
  const r = raw as Record<string, unknown>;
  const nodes = r['nodes'];
  const packets = r['packets'];
  const stepMs = r['stepMs'];
  if (!Array.isArray(nodes) || !nodes.every((n): n is string => typeof n === 'string')) {
    throw new Error('hop-by-hop: nodes 는 문자열 배열이어야 한다');
  }
  if (!Array.isArray(packets) || !packets.every((p): p is string => typeof p === 'string')) {
    throw new Error('hop-by-hop: packets 는 문자열 배열이어야 한다');
  }
  if (nodes.length < 2) throw new Error('hop-by-hop: 마디는 둘 이상이어야 한다');
  if (packets.length < 1) throw new Error('hop-by-hop: 패킷이 없다');
  if (new Set(nodes).size !== nodes.length) throw new Error('hop-by-hop: 마디 이름이 겹친다');
  if (new Set(packets).size !== packets.length) throw new Error('hop-by-hop: 패킷 이름이 겹친다');
  if (typeof stepMs !== 'number' || !(stepMs > 0)) throw new Error('hop-by-hop: stepMs 가 양수가 아니다');
  return { type: 'hop-by-hop', nodes: [...nodes], packets: [...packets], stepMs };
}

/**
 * 틱을 끝까지 셈한다. 틱마다 링크 (i → i+1) 가 마디 i 에 틱 시작 전부터 있던
 * 패킷 가운데 번호가 가장 작은 것을 나른다.
 */
export function simulateHops(data: HopByHopFacetData): HopTick[] {
  const last = data.nodes.length - 1;
  const links = last;
  const where = data.packets.map(() => 0);
  // 패킷 하나가 적어도 한 링크를 쓰므로 링크 × 패킷 틱이면 반드시 끝난다.
  const bound = links * data.packets.length;
  const ticks: HopTick[] = [];
  let t = 0;
  while (where.some((w) => w < last)) {
    t += 1;
    if (t > bound) throw new Error(`hop-by-hop: 틱 ${bound} 안에 끝나지 않는다`);
    const moves: HopMove[] = [];
    for (let i = 0; i < links; i += 1) {
      const here = where.findIndex((w) => w === i);
      if (here >= 0) moves.push({ packet: here, from: i, to: i + 1 });
    }
    for (const m of moves) where[m.packet] = m.to;
    ticks.push({ t, moves });
  }
  return ticks;
}

export async function hopByHop(ctx: FacetContext<HopByHopFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<HopByHopFacetData>;
  const data = readHopByHopData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const ticks = simulateHops(data);
  await ctx.emit({ type: 'init', payload: { tickCount: ticks.length }, silent: true });

  // 걸음 0 은 이미 읽을 것이 있다 (마디 줄과 첫 마디의 패킷들) — 첫 틱 앞에도 문을 둔다.
  for (let k = 0; k < ticks.length; k += 1) {
    if (!(await pause())) return;
    const tick = ticks[k];
    if (tick === undefined) throw new Error(`hop-by-hop: 틱 ${k + 1} 이 없다`);
    await ctx.emit({
      type: 'tick',
      payload: {
        t: tick.t,
        moves: tick.moves.map((m) => ({ ...m })),
        last: k === ticks.length - 1,
      },
    });
  }
}
