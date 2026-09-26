/**
 * spread-in-turn — 라운드 로빈 분배.
 *
 * 요청이 온 차례대로 하나씩, 차례 표가 가리키는 서버로 간다. 차례 표는 요청의
 * 무게와 상관없이 다음 서버로 한 칸 돈다 (마지막 다음은 첫 서버). 서버의 상태
 * (받은 수 · 쌓인 무게)는 고름의 입력이 아니다 — 결과로 쌓일 뿐이다.
 * 시간 · 처리 · 끝남은 이 모형에 없다.
 *
 * 이벤트 (전부 type 리터럴)
 *
 *   init  silent: true — 걸음 0 을 갈아 끼운다
 *     payload { pointer: string; received: number[]; load: number[] }
 *       pointer   처음 차례 표가 가리키는 서버 식별자 (자료의 start)
 *       received  서버 차례대로 받은 수 — 처음 값
 *       load      서버 차례대로 쌓인 무게 — 처음 값
 *
 *   pick  걸음 하나 = 요청 하나
 *     payload { request: string; server: string; next: string; received: number; load: number }
 *       request   도착한 요청 식별자 (r1 ..)
 *       server    받은 서버 = 이 걸음 앞 차례 표가 가리키던 서버 (장면이 앞 장면과 맞는지 본다)
 *       next      한 칸 돈 뒤 차례 표
 *       received  server 가 이 요청까지 받은 수
 *       load      server 에 이 요청까지 쌓인 무게
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SpreadRequest = { id: string; weight: number };

export type SpreadInTurnFacetData = {
  type: 'spread-in-turn';
  stepMs: number;
  /** 차례 표가 도는 순서 그대로의 서버 식별자 */
  servers: string[];
  /** 처음 차례 표가 가리키는 서버 */
  start: string;
  /** 온 차례대로의 요청 — 무게는 처리에 드는 일의 단위 */
  requests: SpreadRequest[];
};

function fail(path: string, why: string): never {
  throw new Error(`spread-in-turn: ${path} — ${why}`);
}

/** 자료 좁히개. 알고리즘과 장면이 함께 부른다. */
export function readSpreadData(raw: unknown): SpreadInTurnFacetData {
  if (typeof raw !== 'object' || raw === null) fail('data', '객체가 아니다');
  const o = raw as Record<string, unknown>;
  if (o.type !== 'spread-in-turn') fail('data.type', `'spread-in-turn' 이 아니다`);
  const stepMs = o.stepMs;
  if (typeof stepMs !== 'number' || !Number.isFinite(stepMs) || stepMs < 0) fail('data.stepMs', '0 이상의 수가 아니다');
  const servers = o.servers;
  if (!Array.isArray(servers) || servers.length === 0) fail('data.servers', '비어 있지 않은 배열이 아니다');
  const ids: string[] = [];
  servers.forEach((s, i) => {
    if (typeof s !== 'string' || s.length === 0) fail(`data.servers[${i}]`, '식별자 문자열이 아니다');
    if (ids.includes(s)) fail(`data.servers[${i}]`, `겹친 식별자 ${s}`);
    ids.push(s);
  });
  const start = o.start;
  if (typeof start !== 'string' || !ids.includes(start)) fail('data.start', '서버 목록에 없다');
  const requests = o.requests;
  if (!Array.isArray(requests) || requests.length === 0) fail('data.requests', '비어 있지 않은 배열이 아니다');
  const reqs: SpreadRequest[] = [];
  requests.forEach((r, i) => {
    if (typeof r !== 'object' || r === null) fail(`data.requests[${i}]`, '객체가 아니다');
    const rr = r as Record<string, unknown>;
    if (typeof rr.id !== 'string' || rr.id.length === 0) fail(`data.requests[${i}].id`, '식별자 문자열이 아니다');
    if (reqs.some((q) => q.id === rr.id)) fail(`data.requests[${i}].id`, `겹친 식별자 ${rr.id}`);
    const w = rr.weight;
    if (typeof w !== 'number' || !Number.isInteger(w) || w < 1) fail(`data.requests[${i}].weight`, '1 이상의 정수가 아니다');
    reqs.push({ id: rr.id, weight: w });
  });
  return { type: 'spread-in-turn', stepMs, servers: ids, start, requests: reqs };
}

export async function spreadInTurn(ctx: FacetContext<SpreadInTurnFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<SpreadInTurnFacetData>;
  const data = readSpreadData(rctx.data);
  const { servers, requests, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  let pointer = servers.indexOf(data.start);
  const received = servers.map(() => 0);
  const load = servers.map(() => 0);

  await rctx.emit({
    type: 'init',
    silent: true,
    payload: { pointer: servers[pointer], received: [...received], load: [...load] },
  });

  for (const req of requests) {
    // 걸음 0 은 서버 · 요청 줄 · 차례 표가 이미 보이는 화면이라 첫 걸음 앞에도 읽을 틈을 둔다
    if (!(await pause())) return;
    // 고름은 차례 표 하나만 본다 — 서버의 받은 수 · 쌓인 무게는 읽지 않는다
    const target = pointer;
    received[target] += 1;
    load[target] += req.weight;
    pointer = (pointer + 1) % servers.length;
    await rctx.emit({
      type: 'pick',
      payload: {
        request: req.id,
        server: servers[target],
        next: servers[pointer],
        received: received[target],
        load: load[target],
      },
    });
  }
}
