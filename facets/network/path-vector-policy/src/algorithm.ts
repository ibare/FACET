/**
 * 경로 벡터 — 받은 길 여럿 가운데 하나를 정책으로 고른다 (조각).
 *
 * 나(`me`)는 목적지 망 `prefix` 로 가는 길을 이웃 여럿에게서 받는다. 길은 거쳐 온 AS 번호의 줄이다
 * (맨 앞이 보낸 이웃, 맨 끝이 그 망을 가진 AS `origin`). 고르는 규약:
 *  1) 길에 내 번호가 들어 있으면 버린다 (고리 막기).
 *  2) 남은 길을 선호(이웃과의 관계로 매긴 로컬 프리퍼런스) 큰 차례로, 같으면 AS 길이가 짧은 차례로,
 *     그래도 같으면 이웃 번호가 작은 차례로 세운다. 맨 앞이 고른 길이다.
 * 실제 BGP 의 나머지 고르기 단계(MED · 출처 종류 등)는 줄였다. 고른 길을 이웃에게 다시 알리는 것은
 * 이 조각이 그리지 않는다 — 고르기에서 멈춘다. 선호 값은 예로 정한 값이다.
 *
 * 발신 이벤트 (모두 silent 아님, 한 걸음 = 한 판정):
 *  - `arrive` { neighbors: number[] }
 *      이웃이 보낸 길이 받은 차례대로 닿는다.
 *  - `loop`   { dropped: { from: number; at: number }[]; kept: number[] }
 *      내 번호가 든 길을 걸러 낸다. `at` 은 그 길에서 내 번호의 자리(0 부터), `kept` 는 남은 길의
 *      보낸 이웃 (받은 차례).
 *  - `rank`   { prefs: { from: number; pref: number; length: number }[] }
 *      남은 길마다 관계로 매긴 선호와 AS 길이 (받은 차례).
 *  - `pick`   { order: number[]; chosen: number; shortest: number; shortestRank: number }
 *      규약 2 로 세운 차례, 고른 이웃, 가장 짧은 길의 이웃과 그 길이 선 자리(1 부터).
 *
 * 걸음 0(나 · 목적지)이 이미 읽을 화면이라 첫 발신 앞에 `stepMs` 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Relation = 'customer' | 'peer' | 'provider';

export interface RouteAd {
  /** 길을 보낸 이웃의 AS 번호 */
  from: number;
  /** 그 이웃과의 관계 */
  rel: Relation;
  /** 거쳐 온 AS 번호의 줄 — 맨 앞이 보낸 이웃, 맨 끝이 origin */
  path: number[];
}

export interface RelationPref {
  rel: Relation;
  pref: number;
}

export interface PathVectorPolicyFacetData {
  type: 'path-vector-policy';
  stepMs: number;
  /** 내 AS 번호 */
  me: number;
  /** 목적지 망 */
  prefix: string;
  /** 그 망을 가진 AS */
  origin: number;
  /** 관계마다 선호 — 차례도 자료다 (색의 차례) */
  prefs: RelationPref[];
  /** 받은 길 — 받은 차례 */
  routes: RouteAd[];
}

const RELATIONS: readonly Relation[] = ['customer', 'peer', 'provider'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readAsNumber(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
    throw new Error(`path-vector-policy: ${where} 가 AS 번호(양의 정수)가 아니다`);
  }
  return v;
}

function readRelation(v: unknown, where: string): Relation {
  const hit = RELATIONS.find((r) => r === v);
  if (hit === undefined) throw new Error(`path-vector-policy: ${where} 의 관계를 모른다: ${String(v)}`);
  return hit;
}

/** initialData 를 좁힌다. 모르는 모양은 던진다 (C6). 장면도 이것으로 바탕을 읽는다. */
export function readPathVectorPolicyData(raw: unknown): PathVectorPolicyFacetData {
  if (!isRecord(raw)) throw new Error('path-vector-policy: initialData 가 객체가 아니다');
  if (raw.type !== 'path-vector-policy') throw new Error('path-vector-policy: type 이 다르다');
  const stepMs = raw.stepMs;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) throw new Error('path-vector-policy: stepMs 가 없다');
  const me = readAsNumber(raw.me, 'me');
  const origin = readAsNumber(raw.origin, 'origin');
  if (typeof raw.prefix !== 'string' || raw.prefix === '') throw new Error('path-vector-policy: prefix 가 없다');
  const prefix = raw.prefix;

  if (!Array.isArray(raw.prefs) || raw.prefs.length === 0) throw new Error('path-vector-policy: prefs 가 없다');
  const prefs: RelationPref[] = raw.prefs.map((p, i) => {
    if (!isRecord(p)) throw new Error(`path-vector-policy: prefs[${i}] 가 객체가 아니다`);
    const rel = readRelation(p.rel, `prefs[${i}]`);
    if (typeof p.pref !== 'number' || !Number.isFinite(p.pref) || p.pref <= 0) {
      throw new Error(`path-vector-policy: prefs[${i}] 의 선호가 양수가 아니다`);
    }
    return { rel, pref: p.pref };
  });
  if (new Set(prefs.map((p) => p.rel)).size !== prefs.length) {
    throw new Error('path-vector-policy: 같은 관계의 선호가 둘이다');
  }

  if (!Array.isArray(raw.routes) || raw.routes.length === 0) throw new Error('path-vector-policy: routes 가 없다');
  const routes: RouteAd[] = raw.routes.map((r, i) => {
    if (!isRecord(r)) throw new Error(`path-vector-policy: routes[${i}] 가 객체가 아니다`);
    const from = readAsNumber(r.from, `routes[${i}].from`);
    const rel = readRelation(r.rel, `routes[${i}]`);
    if (!Array.isArray(r.path) || r.path.length === 0) throw new Error(`path-vector-policy: routes[${i}] 의 길이 비었다`);
    const path = r.path.map((a, k) => readAsNumber(a, `routes[${i}].path[${k}]`));
    if (path[0] !== from) throw new Error(`path-vector-policy: routes[${i}] 의 길이 보낸 이웃 AS${from} 로 시작하지 않는다`);
    if (path[path.length - 1] !== origin) {
      throw new Error(`path-vector-policy: routes[${i}] 의 길이 origin AS${origin} 에서 끝나지 않는다`);
    }
    if (from === me) throw new Error(`path-vector-policy: routes[${i}] 를 내가 보냈다`);
    return { from, rel, path };
  });
  if (new Set(routes.map((r) => r.from)).size !== routes.length) {
    throw new Error('path-vector-policy: 한 이웃이 길을 둘 보냈다');
  }
  return { type: 'path-vector-policy', stepMs, me, prefix, origin, prefs, routes };
}

function prefOf(data: PathVectorPolicyFacetData, rel: Relation): number {
  const hit = data.prefs.find((p) => p.rel === rel);
  if (hit === undefined) throw new Error(`path-vector-policy: 관계 ${rel} 의 선호가 없다`);
  return hit.pref;
}

export async function pathVectorPolicy(ctx: FacetContext<unknown>): Promise<void> {
  const rctx = ctx as ReactiveContext<unknown>;
  const data = readPathVectorPolicyData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  // 걸음 0 — 나와 목적지를 읽을 틈
  if (!(await pause())) return;

  // 1) 길 넷이 받은 차례대로 닿는다
  await ctx.emit({ type: 'arrive', payload: { neighbors: data.routes.map((r) => r.from) } });
  if (!(await pause())) return;

  // 2) 고리 거르기 — 내 번호가 든 길을 버린다
  const dropped: { from: number; at: number }[] = [];
  const kept: RouteAd[] = [];
  for (const r of data.routes) {
    if (ctx.cancelled) return;
    const at = r.path.indexOf(data.me);
    if (at >= 0) dropped.push({ from: r.from, at });
    else kept.push(r);
  }
  if (kept.length === 0) throw new Error('path-vector-policy: 고리를 거르고 나니 남은 길이 없다');
  await ctx.emit({ type: 'loop', payload: { dropped, kept: kept.map((r) => r.from) } });
  if (!(await pause())) return;

  // 3) 선호 매기기 — 관계로 매긴 선호와 AS 길이
  const scored = kept.map((r) => ({ from: r.from, pref: prefOf(data, r.rel), length: r.path.length }));
  await ctx.emit({ type: 'rank', payload: { prefs: scored } });
  if (!(await pause())) return;

  // 4) 고르기 — 선호 큰 차례, 같으면 짧은 차례, 그래도 같으면 이웃 번호 작은 차례
  const order = [...scored].sort((a, b) => b.pref - a.pref || a.length - b.length || a.from - b.from);
  const chosen = order[0];
  if (chosen === undefined) throw new Error('path-vector-policy: 세울 길이 없다');
  const shortest = [...scored].sort((a, b) => a.length - b.length || a.from - b.from)[0];
  if (shortest === undefined) throw new Error('path-vector-policy: 가장 짧은 길이 없다');
  const shortestRank = order.findIndex((s) => s.from === shortest.from) + 1;
  await ctx.emit({
    type: 'pick',
    payload: {
      order: order.map((s) => s.from),
      chosen: chosen.from,
      shortest: shortest.from,
      shortestRank,
    },
  });
}
