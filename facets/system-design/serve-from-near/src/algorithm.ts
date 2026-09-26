/**
 * serve-from-near — 가까운 곳에서 내어 준다.
 *
 * 사용자 넷이 차례로 요청 하나씩을 보낸다. 요청은 왕복 ms 가 가장 작은 엣지로 가서
 * 거기서 되돌아온다. 엣지는 처음부터 콘텐츠를 들고 있으므로 오리진에는 가지 않는다.
 * 오리진까지의 왕복은 견줄 짝으로만 셈한다.
 *
 * 이벤트
 *   init   (silent) { span: number, edgeTotal: number, originTotal: number,
 *                     originRequests: number, served: { edge: string, n: number }[] }
 *          셈으로 나오는 바탕 — 축의 끝(왕복 ms 의 최댓값)과 누계 · 횟수의 출발값
 *   serve  { user: string, edge: string, ms: number, originMs: number, saved: number,
 *            edgeTotal: number, originTotal: number, originRequests: number, edgeServed: number }
 *          사용자 요청 하나 — 고른 엣지 · 그 왕복 · 오리진이었다면의 왕복 · 줄어든 것 ·
 *          누계 · 오리진 요청 수 · 그 엣지가 지금까지 내어 준 수
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ServeFromNearFacetData = {
  type: 'serve-from-near';
  stepMs: number;
  /** 엣지 식별자 (번역하지 않는 자료) */
  edges: string[];
  /** 오리진 식별자 */
  origin: string;
  /** 요청을 보내는 사용자 식별자, 차례대로 */
  users: string[];
  /** 처음부터 콘텐츠를 들고 있는 엣지 */
  holding: string[];
  /** 사용자 → 자리(엣지 · 오리진) 왕복 ms */
  rtt: Record<string, Record<string, number>>;
};

function fail(path: string, why: string): never {
  throw new Error(`serve-from-near: ${path} — ${why}`);
}

function readIdList(raw: unknown, path: string): string[] {
  if (!Array.isArray(raw) || raw.length === 0) fail(path, '비지 않은 배열이어야 한다');
  const out: string[] = [];
  raw.forEach((v, i) => {
    if (typeof v !== 'string' || v === '') fail(`${path}[${i}]`, '비지 않은 문자열이어야 한다');
    if (out.includes(v)) fail(`${path}[${i}]`, `겹친 식별자 ${v}`);
    out.push(v);
  });
  return out;
}

/** 좁히개 — 알고리즘과 장면의 initial 이 함께 부른다. 값을 베껴 돌려준다. */
export function readServeFromNearData(raw: unknown): ServeFromNearFacetData {
  if (typeof raw !== 'object' || raw === null) fail('initialData', '객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'serve-from-near') fail('initialData.type', `serve-from-near 가 아니다: ${String(d.type)}`);
  if (typeof d.stepMs !== 'number' || !(d.stepMs > 0)) fail('initialData.stepMs', '양수여야 한다');
  const edges = readIdList(d.edges, 'initialData.edges');
  if (typeof d.origin !== 'string' || d.origin === '') fail('initialData.origin', '비지 않은 문자열이어야 한다');
  const origin = d.origin;
  if (edges.includes(origin)) fail('initialData.origin', `엣지와 겹친다: ${origin}`);
  const holding = readIdList(d.holding, 'initialData.holding');
  holding.forEach((h, i) => {
    if (!edges.includes(h)) fail(`initialData.holding[${i}]`, `없는 엣지 ${h}`);
  });
  const users = readIdList(d.users, 'initialData.users');
  if (typeof d.rtt !== 'object' || d.rtt === null) fail('initialData.rtt', '객체가 아니다');
  const rawRtt = d.rtt as Record<string, unknown>;
  const rtt: Record<string, Record<string, number>> = {};
  for (const u of users) {
    const row = rawRtt[u];
    if (typeof row !== 'object' || row === null) fail(`initialData.rtt.${u}`, '줄이 없다');
    const r = row as Record<string, unknown>;
    const copy: Record<string, number> = {};
    for (const site of [...edges, origin]) {
      const v = r[site];
      if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
        fail(`initialData.rtt.${u}.${site}`, '양의 정수 ms 여야 한다');
      }
      copy[site] = v;
    }
    rtt[u] = copy;
  }
  return { type: 'serve-from-near', stepMs: d.stepMs, edges, origin, holding, users, rtt };
}

/** 사용자 한 줄에서 왕복이 가장 작은 엣지. 동률이면 던진다. */
export function nearestEdge(data: ServeFromNearFacetData, user: string): string {
  const row = data.rtt[user];
  if (!row) fail(`rtt.${user}`, '없는 사용자');
  let best: string | null = null;
  let tie = false;
  for (const e of data.edges) {
    const ms = row[e];
    if (ms === undefined) fail(`rtt.${user}.${e}`, '없는 엣지');
    if (best === null || ms < (row[best] as number)) {
      best = e;
      tie = false;
    } else if (ms === row[best]) {
      tie = true;
    }
  }
  if (best === null) fail('edges', '엣지가 없다');
  if (tie) fail(`rtt.${user}`, `가장 가까운 엣지가 둘 이상이다 (${row[best]} ms)`);
  return best;
}

/** 축의 끝 — 표에 든 왕복 ms 의 최댓값 (바탕에서 정해진다). */
function rttSpan(data: ServeFromNearFacetData): number {
  let span = 0;
  for (const u of data.users) {
    for (const site of [...data.edges, data.origin]) {
      const v = data.rtt[u]?.[site];
      if (v === undefined) fail(`rtt.${u}.${site}`, '없다');
      if (v > span) span = v;
    }
  }
  return span;
}

export async function serveFromNear(context: FacetContext<ServeFromNearFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<ServeFromNearFacetData>;
  const data = readServeFromNearData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const served = new Map<string, number>();
  for (const e of data.edges) served.set(e, 0);
  let edgeTotal = 0;
  let originTotal = 0;
  /** 오리진까지 간 요청 — 모든 요청이 엣지에서 돌아서므로 늘지 않는다 */
  const originRequests = 0;

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      span: rttSpan(data),
      edgeTotal,
      originTotal,
      originRequests,
      served: data.edges.map((edge) => ({ edge, n: 0 })),
    },
  });
  // 걸음 0 은 이미 엣지 · 사용자 · 먼 길을 보인다 — 읽을 틈을 둔다
  if (!(await pause())) return;

  for (const user of data.users) {
    if (ctx.cancelled) return;
    const edge = nearestEdge(data, user);
    const row = data.rtt[user] as Record<string, number>;
    const ms = row[edge] as number;
    const originMs = row[data.origin] as number;
    // 고른 엣지가 콘텐츠를 들고 있어야 거기서 돌아선다. 없을 때 오리진에서 끌어오는 일은
    // 이 조각의 모형 밖이다(origin-pull) — 조용히 오리진으로 돌리지 않고 던진다
    if (!data.holding.includes(edge)) fail(`holding`, `${edge} 가 콘텐츠를 들고 있지 않다`);
    const n = (served.get(edge) as number) + 1;
    served.set(edge, n);
    edgeTotal += ms;
    originTotal += originMs;
    await ctx.emit({
      type: 'serve',
      payload: {
        user,
        edge,
        ms,
        originMs,
        saved: originMs - ms,
        edgeTotal,
        originTotal,
        originRequests,
        edgeServed: n,
      },
    });
    if (!(await pause())) return;
  }
}
