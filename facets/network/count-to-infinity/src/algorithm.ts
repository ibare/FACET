/**
 * count-to-infinity — 선이 끊긴 뒤 두 라우터가 서로의 수를 믿고 한 칸씩 올라가 16 에 닿는다.
 *
 * 모형 (RIP 을 줄인 것 — 설명 글이 밝힌다)
 * - 수: 망에 바로 붙은 라우터 = 1, 이웃에게서 받으면 +1, `infinity`(16) = 닿을 수 없음, 넘으면 16 으로 누른다.
 * - 다음 홉이 알린 수는 커져도 받아 적는다. 더 작은 수는 누가 알려도 받는다.
 * - 수렴한 표는 선 전부로 동기 라운드를 돌려 셈한다 (보내는 쪽은 라운드 처음의 상태로, 같은 라운드에 받는
 *   차례는 보낸 이 이름이 앞선 쪽 먼저).
 * - 선이 끊기면 그 선 너머를 다음 홉으로 쥐던 라우터는 길을 잃고, **아무에게도 알리지 않는다**
 *   (즉시 알림 · 스플릿 호라이즌 · 포이즌 리버스 없음).
 * - 끊긴 뒤 라운드 하나 = `order` 의 알림을 적힌 차례대로 하나씩. 한 걸음 = 한 라운드.
 * - `order` 에 나오는 라우터가 모두 `infinity` 가 된 라운드에서 멈춘다.
 * - 셈할 수 없는 상태(없는 이웃 · 끊긴 선으로 알림 · 보낼 길이 없는 이 · 받지 않는 알림 · 수렴하지 않는
 *   라운드)는 던진다.
 *
 * 이벤트 (전부 `ctx.emit` 을 await)
 * - `init`  silent: true
 *     payload { table: Array<{ router: string; d: number; via: string | null }> }
 *     수렴한 표. `via` 가 null 이면 망에 바로 붙었다. d 가 작은 차례.
 * - `cut`
 *     payload { a: string; b: string; lost: string[] }
 *     선 a–b 가 끊긴다. lost 는 그 선 너머를 다음 홉으로 쥐던 라우터들.
 * - `round`
 *     payload { round: number; ended: boolean; reached: string[];
 *               moves: Array<{ from: string; to: string; told: number; sum: number; set: number }> }
 *     told = 보낸 이의 수, sum = told + 1, set = 받아 적은 수 (sum 을 infinity 로 누른 것).
 *     ended 는 이 라운드로 order 의 라우터가 모두 infinity 가 되었는가.
 *     reached 는 이 라운드 끝에 infinity 인 라우터 이름 (routers 차례).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CountToInfinityFacetData = {
  type: 'count-to-infinity';
  stepMs: number;
  /** 라우터 A 에 바로 붙은 망 */
  net: string;
  routers: string[];
  links: Array<[string, string]>;
  /** 망에 바로 붙은 라우터 */
  attached: string;
  /** 끊기는 선 */
  cut: [string, string];
  /** 끊긴 뒤 한 라운드 안의 알림 차례 [보내는 이, 받는 이] */
  order: Array<[string, string]>;
  infinity: number;
  maxRounds: number;
};

type Route = { d: number; via: string | null };

function hasLink(links: Array<[string, string]>, a: string, b: string): boolean {
  return links.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

function neighbours(links: Array<[string, string]>, r: string): string[] {
  const out: string[] = [];
  for (const [x, y] of links) {
    if (x === r) out.push(y);
    else if (y === r) out.push(x);
  }
  return out.sort();
}

/** 받는 쪽의 판정 — 없으면 받고, 더 작으면 받고, 다음 홉이 알린 것이면 커져도 받는다. */
function takes(cur: Route | undefined, offer: number, from: string): boolean {
  return cur === undefined || offer < cur.d || cur.via === from;
}

/** 선 전부로 동기 라운드를 돌려 수렴한 표를 셈한다. */
export function converge(data: CountToInfinityFacetData): Map<string, Route> {
  for (const [a, b] of data.links) {
    if (!data.routers.includes(a) || !data.routers.includes(b)) {
      throw new Error(`count-to-infinity: 없는 라우터를 잇는 선 ${a}–${b}`);
    }
  }
  if (!data.routers.includes(data.attached)) {
    throw new Error(`count-to-infinity: 망에 붙은 라우터 ${data.attached} 가 없다`);
  }
  const table = new Map<string, Route>([[data.attached, { d: 1, via: null }]]);
  for (let round = 1; ; round += 1) {
    if (round > data.maxRounds) throw new Error('count-to-infinity: 수렴하지 않는다');
    const snapshot = new Map(table);
    let changed = false;
    // 받는 차례는 보낸 이 이름이 앞선 쪽 먼저
    const senders = [...snapshot.keys()].sort();
    for (const s of senders) {
      const sent = snapshot.get(s);
      if (sent === undefined) continue;
      for (const r of neighbours(data.links, s)) {
        if (r === data.attached) continue;
        const offer = Math.min(sent.d + 1, data.infinity);
        const cur = table.get(r);
        if (!takes(cur, offer, s)) continue;
        if (cur !== undefined && cur.d === offer && cur.via === s) continue;
        table.set(r, { d: offer, via: s });
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (const r of data.routers) {
    if (!table.has(r)) throw new Error(`count-to-infinity: ${r} 는 망에 닿지 않는다`);
  }
  return table;
}

export async function countToInfinity(
  context: FacetContext<CountToInfinityFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<CountToInfinityFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const table = converge(data);
  const rows = [...table.entries()]
    .map(([router, r]) => ({ router, d: r.d, via: r.via }))
    .sort((p, q) => p.d - q.d || (p.router < q.router ? -1 : 1));
  await ctx.emit({ type: 'init', silent: true, payload: { table: rows } });

  // 걸음 0 (수렴한 표) 을 읽을 틈
  if (!(await pause())) return;

  const [a, b] = data.cut;
  if (!hasLink(data.links, a, b)) throw new Error(`count-to-infinity: 끊을 선 ${a}–${b} 가 없다`);
  const links = data.links.filter(([x, y]) => !((x === a && y === b) || (x === b && y === a)));
  const lost: string[] = [];
  for (const [router, r] of table) {
    if ((router === a && r.via === b) || (router === b && r.via === a)) lost.push(router);
  }
  for (const router of lost) table.delete(router);
  await ctx.emit({ type: 'cut', payload: { a, b, lost } });

  const racers = [...new Set(data.order.flat())];
  for (let round = 1; ; round += 1) {
    if (!(await pause())) return;
    if (round > data.maxRounds) throw new Error('count-to-infinity: 라운드가 끝나지 않는다');
    const moves: Array<{ from: string; to: string; told: number; sum: number; set: number }> = [];
    for (const [from, to] of data.order) {
      if (!hasLink(links, from, to)) {
        throw new Error(`count-to-infinity: ${from}–${to} 사이에 선이 없다`);
      }
      const sent = table.get(from);
      if (sent === undefined) throw new Error(`count-to-infinity: ${from} 는 알릴 길이 없다`);
      const sum = sent.d + 1;
      const set = Math.min(sum, data.infinity);
      if (!takes(table.get(to), set, from)) {
        throw new Error(`count-to-infinity: ${to} 가 ${from} 의 알림을 받지 않는다 — 이 모형 밖이다`);
      }
      table.set(to, { d: set, via: from });
      moves.push({ from, to, told: sent.d, sum, set });
    }
    const ended = racers.every((r) => table.get(r)?.d === data.infinity);
    const reached = data.routers.filter((r) => table.get(r)?.d === data.infinity);
    await ctx.emit({ type: 'round', payload: { round, ended, reached, moves } });
    if (ended) return;
  }
}
