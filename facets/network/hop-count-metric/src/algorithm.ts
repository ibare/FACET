/**
 * hop-count-metric — 거리 벡터 라우터가 먼 망까지의 걸음 수를 알게 되는 과정.
 *
 * 모형 (RIP 의 수를 줄인 것):
 *  - 망에 바로 붙은 라우터의 수는 1. 이웃이 알린 수 v 를 받으면 제 셈은 v + 1 (16 이상은 16 = 닿을 수 없음).
 *  - 받아 적는 조건: 적힌 것이 없거나, v + 1 이 적힌 수보다 작거나, 알린 이가 지금 다음 홉인데 수가 바뀌었을 때.
 *  - 동기 라운드: 모든 라우터가 라운드 처음의 표로 모든 이웃에게 알린다. 받는 쪽 판정은
 *    보낸 이 이름 차례, 같은 보낸 이 안에서는 받는 이 이름 차례. 한 걸음 = 한 라운드.
 *  - 바뀐 것이 없는 라운드에서 멈춘다. 실제 초는 없다 — 라운드로만 센다 (RIP 의 30 초 주기는 설명 글에서만).
 *  - 줄인 자리: 망은 하나, 시간 초과 · 분할 지평 · 트리거 갱신은 없다.
 *
 * 이벤트 (전부 type 리터럴):
 *  (첫 표는 이벤트가 아니다 — 장면의 initial() 이 이 파일의 startTable 을 불러 initialData 에서 채운다.
 *   망이 붙은 라우터만 수 1 · 다음 홉 null(직접).)
 *  - `round`  payload `{ round: number; offers: Array<{ from: string; to: string; sent: number; value: number; kept: boolean }>;
 *               table: Array<{ dist: number; via: string | null } | null> }`
 *               한 라운드의 알림 전부(판정 차례대로)와 라운드 뒤의 표. `sent` 는 알린 수, `value` 는 받는 쪽 셈(sent + 1, 16 에서 멈춤).
 *  - `choose` payload `{ router: string; candidates: Array<{ via: string; value: number }>; keptVia: string }`
 *               수렴 뒤 지켜보는 라우터(`watch`)에 이웃들의 수가 닿았을 때 무엇이 남는가. candidates 는 이웃 이름 차례.
 *               남는 것은 가장 작은 수, 같으면 이름이 앞선 쪽. 그 결과가 수렴한 표와 다르면 던진다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export const RIP_INFINITY = 16;

export interface HopCountMetricFacetData {
  type: 'hop-count-metric';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  /** 라우터 이름(기호) */
  routers: string[];
  /** 선. 속도 · 지연은 없다 — 이 셈에 들어가지 않는다 */
  links: Array<[string, string]>;
  /** 망 (접두 길이를 붙인 꼴) */
  net: string;
  /** 망이 바로 붙은 라우터 */
  attached: string;
  /** 마지막 걸음에서 이웃의 수를 견주는 라우터 */
  watch: string;
}

export interface RouteEntry {
  dist: number;
  via: string | null;
}

export interface RouteOffer {
  from: string;
  to: string;
  sent: number;
  value: number;
  kept: boolean;
}

/** 라우터마다 이웃 이름을 이름 차례로. 모르는 라우터 · 제 자신과의 선 · 겹친 선은 던진다. */
export function neighborsOf(routers: readonly string[], links: ReadonlyArray<readonly [string, string]>): Map<string, string[]> {
  const nbr = new Map<string, string[]>();
  for (const r of routers) {
    if (nbr.has(r)) throw new Error(`hop-count-metric: 라우터 이름 겹침 ${r}`);
    nbr.set(r, []);
  }
  for (const [a, b] of links) {
    const la = nbr.get(a);
    const lb = nbr.get(b);
    if (!la || !lb) throw new Error(`hop-count-metric: 없는 라우터를 잇는 선 ${a}-${b}`);
    if (a === b) throw new Error(`hop-count-metric: 제 자신과의 선 ${a}`);
    if (la.includes(b)) throw new Error(`hop-count-metric: 겹친 선 ${a}-${b}`);
    la.push(b);
    lb.push(a);
  }
  for (const list of nbr.values()) list.sort();
  return nbr;
}

/** 첫 표 — routers 차례. 망이 붙은 라우터만 수 1 · 다음 홉 null(직접). 알고리즘과 장면이 함께 부른다. */
export function startTable(routers: readonly string[], attached: string): Array<RouteEntry | null> {
  return routers.map((r) => (r === attached ? { dist: 1, via: null } : null));
}

function copyTable(table: ReadonlyArray<RouteEntry | null>): Array<RouteEntry | null> {
  return table.map((e) => (e ? { dist: e.dist, via: e.via } : null));
}

export async function hopCountMetric(ctx: FacetContext<HopCountMetricFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<HopCountMetricFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const routers = data.routers;
  const nbr = neighborsOf(routers, data.links);
  const index = new Map<string, number>(routers.map((r, i) => [r, i]));
  if (!index.has(data.attached)) throw new Error(`hop-count-metric: 망이 붙은 라우터 ${data.attached} 가 없다`);
  if (!index.has(data.watch)) throw new Error(`hop-count-metric: 지켜보는 라우터 ${data.watch} 가 없다`);

  const senders = [...routers].sort();
  const table = startTable(routers, data.attached);

  // 수렴하지 않으면 던진다. 수가 16 에서 멈추므로 라운드 수는 라우터 수 × 16 을 넘지 않는다.
  const roundLimit = routers.length * RIP_INFINITY;
  let round = 0;
  for (;;) {
    // 첫 라운드 앞의 기다림은 걸음 0(망이 붙은 라우터의 수 1)을 읽을 틈이다.
    if (!(await pause())) return;
    round += 1;
    if (round > roundLimit) throw new Error(`hop-count-metric: ${roundLimit} 라운드 안에 수렴하지 않는다`);

    const snap = copyTable(table);
    const offers: RouteOffer[] = [];
    let changed = 0;
    for (const s of senders) {
      if (ctx.cancelled) return;
      const mine = snap[index.get(s)!];
      if (!mine) continue; // 적힌 것이 없는 라우터는 알릴 것이 없다
      for (const r of nbr.get(s)!) {
        const ri = index.get(r)!;
        const value = Math.min(mine.dist + 1, RIP_INFINITY);
        const cur = table[ri];
        const kept = cur === null || value < cur.dist || (cur.via === s && value !== cur.dist);
        if (kept) {
          table[ri] = { dist: value, via: s };
          changed += 1;
        }
        offers.push({ from: s, to: r, sent: mine.dist, value, kept });
      }
    }

    await ctx.emit({ type: 'round', payload: { round, offers, table: copyTable(table) } });
    if (changed === 0) break;
  }

  if (!(await pause())) return;

  const watchEntry = table[index.get(data.watch)!];
  if (!watchEntry) throw new Error(`hop-count-metric: 수렴한 뒤에도 ${data.watch} 에 적힌 것이 없다`);
  const candidates: Array<{ via: string; value: number }> = [];
  for (const n of nbr.get(data.watch)!) {
    const e = table[index.get(n)!];
    if (!e) continue; // 적힌 것이 없는 이웃은 알리지 않는다
    candidates.push({ via: n, value: Math.min(e.dist + 1, RIP_INFINITY) });
  }
  if (candidates.length === 0) throw new Error(`hop-count-metric: ${data.watch} 에 닿은 수가 없다`);
  let best = candidates[0]!;
  for (const c of candidates) {
    if (c.value < best.value || (c.value === best.value && c.via < best.via)) best = c;
  }
  if (best.value !== watchEntry.dist || best.via !== watchEntry.via) {
    throw new Error(
      `hop-count-metric: 견줌(${best.via} 쪽 ${best.value})과 수렴한 표(${String(watchEntry.via)} 쪽 ${watchEntry.dist})가 다르다`,
    );
  }

  await ctx.emit({ type: 'choose', payload: { router: data.watch, candidates, keptVia: best.via } });
}
