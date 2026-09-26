/**
 * origin-pull — 빈 엣지에 거의 동시에 온 요청들이 오리진 가져오기 하나에 모인다.
 *
 * 시각 단위는 ms. 걸음 하나 = 사건 하나(요청 도착 하나 또는 오리진 응답 하나), 시각 차례대로.
 * 같은 ms 에 가져오기 끝과 도착이 겹치면 끝이 먼저다.
 *
 * 규약
 *   - 엣지에 없고 가는 중인 가져오기도 없으면 → 가져오기를 연다 (끝 = 지금 + fetchMs). 오리진 요청 +1
 *   - 엣지에 없고 가져오기가 가는 중이면 → 거기에 붙어 기다린다 (요청 합치기). 오리진을 부르지 않는다
 *   - 가져오기가 끝나면 엣지에 두고 기다리던 요청 모두에 한꺼번에 준다. 기다림 = 받은 ms − 도착 ms
 *   - 엣지에 있으면 → 바로 준다 (기다림 0)
 *
 * 이벤트
 *   init      (silent) payload { now: number; originCalls: number; cached: boolean }
 *             — 셈의 출발점. 걸음 0 을 갈아 끼운다
 *   arrive    payload { id: string; at: number; outcome: 'miss' | 'join' | 'hit';
 *                       fetchEnd: number | null;   // miss 일 때만 연 가져오기의 끝 ms
 *                       originCalls: number;       // 이 도착 뒤 오리진이 받은 요청 수
 *                       wait: number | null }      // hit 일 때만 0 (받은 ms − 도착 ms)
 *   response  payload { at: number; delivered: { id: string; wait: number }[];  // 기다리던 차례대로
 *                       originCalls: number }
 *
 * ctx.metric 은 부르지 않는다 (S-piece).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type OriginPullRequest = { id: string; at: number };

export type OriginPullFacetData = {
  type: 'origin-pull';
  stepMs: number;
  /** 요청 경로 — 번역하지 않는 자료 */
  path: string;
  /** 엣지 → 오리진 가져오기가 끝나기까지 ms */
  fetchMs: number;
  /** 요청 식별자와 도착 ms */
  requests: OriginPullRequest[];
};

function fail(path: string, why: string): never {
  throw new Error(`origin-pull: ${path} — ${why}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function nonNegInt(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) fail(path, '0 이상의 정수가 아니다');
  return v;
}

/** 자료 좁히개 — 알고리즘 · 장면 · stage 가 함께 쓴다. 어긋나면 던진다. */
export function narrowOriginPullData(raw: unknown): OriginPullFacetData {
  if (!isRecord(raw)) fail('data', '객체가 아니다');
  if (raw.type !== 'origin-pull') fail('data.type', "'origin-pull' 이 아니다");
  const stepMs = nonNegInt(raw.stepMs, 'data.stepMs');
  if (typeof raw.path !== 'string' || raw.path.length === 0) fail('data.path', '빈 문자열이거나 문자열이 아니다');
  const fetchMs = nonNegInt(raw.fetchMs, 'data.fetchMs');
  if (fetchMs === 0) fail('data.fetchMs', '0 이다 — 가져오기에 시간이 들어야 합칠 틈이 생긴다');
  if (!Array.isArray(raw.requests) || raw.requests.length === 0) fail('data.requests', '빈 배열이거나 배열이 아니다');
  const seen = new Set<string>();
  const requests: OriginPullRequest[] = raw.requests.map((r: unknown, i: number) => {
    const p = `data.requests[${i}]`;
    if (!isRecord(r)) fail(p, '객체가 아니다');
    if (typeof r.id !== 'string' || r.id.length === 0) fail(`${p}.id`, '빈 문자열이거나 문자열이 아니다');
    if (seen.has(r.id)) fail(`${p}.id`, `겹친다: ${r.id}`);
    seen.add(r.id);
    const at = nonNegInt(r.at, `${p}.at`);
    return { id: r.id, at };
  });
  for (let i = 1; i < requests.length; i += 1) {
    const a = requests[i - 1];
    const b = requests[i];
    if (a === undefined || b === undefined) fail(`data.requests[${i}]`, '없다');
    if (b.at < a.at) fail(`data.requests[${i}].at`, '도착 차례가 시각 차례와 다르다');
  }
  return { type: 'origin-pull', stepMs, path: raw.path, fetchMs, requests };
}

/**
 * 가는 중인 가져오기가 지금 얼마나 왔는가 (0 = 엣지를 떠남 · 1 = 엣지로 돌아옴).
 * 바탕(시작 · 끝)과 지금 시각에서 정해지는 작은 셈이라 stage 가 부른다.
 */
export function fetchProgress(now: number, start: number, end: number): number {
  if (!(end > start)) throw new Error(`origin-pull: 가져오기 구간이 비었다 (${start}..${end})`);
  if (now < start || now > end) throw new Error(`origin-pull: 시각 ${now} 이 가져오기 구간 ${start}..${end} 밖이다`);
  return (now - start) / (end - start);
}

export async function originPull(ctx0: FacetContext<OriginPullFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<OriginPullFacetData>;
  const data = narrowOriginPullData(ctx.data);
  const { stepMs, fetchMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let cached = false;
  let originCalls = 0;
  let fetch: { start: number; end: number } | null = null;
  let waiting: OriginPullRequest[] = [];
  const pending = data.requests.map((r) => ({ id: r.id, at: r.at }));

  await ctx.emit({ type: 'init', silent: true, payload: { now: 0, originCalls, cached } });

  // 걸음 0 에 요청 줄이 이미 보이므로 첫 발신 앞에도 읽을 틈을 둔다.
  while (pending.length > 0 || fetch !== null) {
    if (!(await pause())) return;

    const next = pending[0];
    // 가져오기 끝이 다음 도착보다 앞서거나 같으면 끝이 먼저다.
    if (fetch !== null && (next === undefined || fetch.end <= next.at)) {
      const at: number = fetch.end;
      if (waiting.length === 0) throw new Error('origin-pull: 기다리는 요청 없이 가져오기가 끝났다');
      const delivered = waiting.map((r) => ({ id: r.id, wait: at - r.at }));
      cached = true;
      fetch = null;
      waiting = [];
      await ctx.emit({ type: 'response', payload: { at, delivered, originCalls } });
      continue;
    }

    if (next === undefined) throw new Error('origin-pull: 남은 도착도 가져오기도 없는데 걸음을 돌았다');
    pending.shift();

    if (cached) {
      await ctx.emit({
        type: 'arrive',
        payload: { id: next.id, at: next.at, outcome: 'hit', fetchEnd: null, originCalls, wait: 0 },
      });
    } else if (fetch === null) {
      originCalls += 1;
      fetch = { start: next.at, end: next.at + fetchMs };
      waiting.push(next);
      await ctx.emit({
        type: 'arrive',
        payload: { id: next.id, at: next.at, outcome: 'miss', fetchEnd: fetch.end, originCalls, wait: null },
      });
    } else {
      waiting.push(next);
      await ctx.emit({
        type: 'arrive',
        payload: { id: next.id, at: next.at, outcome: 'join', fetchEnd: null, originCalls, wait: null },
      });
    }
  }
}
