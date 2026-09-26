/**
 * one-door-many-rooms — 문 하나로 들어가 여럿에 닿는다 (API 게이트웨이).
 *
 * 요청은 모두 한 입구(게이트웨이)로 온다. 게이트웨이는 경로의 첫 조각을 경로표와
 * 그대로 견주어 어느 서비스로 보낼지 고른다. 목록이 여럿이면 한꺼번에 흩어 보내고,
 * 처리 시간 오름차순(동률은 경로표 목록 차례)으로 돌아온 것을 모아 한 응답으로 묶는다.
 * 경로표에 없으면 게이트웨이가 404 를 돌려주고 서비스에 가지 않는다.
 * 게이트웨이 · 네트워크 시간은 0 으로 둔다. 요청은 하나가 끝난 뒤 다음이 온다.
 *
 * 이벤트 (걸음 하나 = 아래 가운데 silent 가 아닌 것 하나):
 *   init      silent  { calls: number[] }
 *             — 서비스별 부름 수의 출발값 (services 차례, 모두 0)
 *   route             { req: number, prefix: string, service: string, ms: number,
 *                       status: 200, calls: number }
 *             — 단일 요청 하나의 왕복. calls = 그 서비스가 받은 부름 수(이번 것 포함)
 *   scatter           { req: number, prefix: string, services: string[], calls: number[] }
 *             — 경로표 목록의 서비스에 한꺼번에 보냄. calls = services 차례의 부름 수(이번 것 포함)
 *   gather            { req: number, service: string, ms: number, got: number, of: number }
 *             — 하나 돌아옴. ms = 그 서비스의 처리 시간(흩어 보낸 때부터), got = 모인 수
 *   bundle            { req: number, status: 200, ms: number, parts: string[] }
 *             — 모인 것을 한 응답으로. ms = 가장 느린 것의 처리 시간, parts = 모인 차례
 *   notFound          { req: number, prefix: string, status: 404, serviceCalls: number }
 *             — 경로표에 없음. serviceCalls = 이 요청이 서비스에 보낸 부름 수
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type GatewayService = { id: string; ms: number };
export type GatewayRoute = { prefix: string; targets: string[] };
export type GatewayRequest = { method: string; path: string };

export type OneDoorManyRoomsFacetData = {
  type: 'one-door-many-rooms';
  stepMs: number;
  services: GatewayService[];
  routes: GatewayRoute[];
  requests: GatewayRequest[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readString(v: unknown, where: string): string {
  if (typeof v !== 'string' || v === '') throw new Error(`one-door-many-rooms: ${where} 는 빈 칸이 아닌 문자열이어야 한다`);
  return v;
}

function readPositive(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
    throw new Error(`one-door-many-rooms: ${where} 는 양수여야 한다`);
  }
  return v;
}

function readArray(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v) || v.length === 0) throw new Error(`one-door-many-rooms: ${where} 는 비지 않은 배열이어야 한다`);
  return v;
}

/**
 * 경로의 첫 조각 — `/users/7` → `/users`. 슬래시로 시작하지 않거나 첫 조각이 비면 던진다.
 */
export function firstSegment(path: string): string {
  if (!path.startsWith('/')) throw new Error(`one-door-many-rooms: 경로 ${path} 가 / 로 시작하지 않는다`);
  const head = path.split('/')[1];
  if (head === undefined || head === '') throw new Error(`one-door-many-rooms: 경로 ${path} 의 첫 조각이 비었다`);
  return `/${head}`;
}

/** 자료 좁히개 — 모양이 어긋나면 던진다. 알고리즘과 장면이 함께 부른다. */
export function readOneDoorManyRoomsData(raw: unknown): OneDoorManyRoomsFacetData {
  if (!isRecord(raw)) throw new Error('one-door-many-rooms: 자료가 객체가 아니다');
  if (raw.type !== 'one-door-many-rooms') throw new Error(`one-door-many-rooms: type 이 다르다 (${String(raw.type)})`);
  const stepMs = readPositive(raw.stepMs, 'stepMs');

  const services = readArray(raw.services, 'services').map((s, i): GatewayService => {
    if (!isRecord(s)) throw new Error(`one-door-many-rooms: services[${i}] 가 객체가 아니다`);
    return { id: readString(s.id, `services[${i}].id`), ms: readPositive(s.ms, `services[${i}].ms`) };
  });
  const ids = services.map((s) => s.id);
  if (new Set(ids).size !== ids.length) throw new Error('one-door-many-rooms: 서비스 식별자가 겹친다');

  const routes = readArray(raw.routes, 'routes').map((r, i): GatewayRoute => {
    if (!isRecord(r)) throw new Error(`one-door-many-rooms: routes[${i}] 가 객체가 아니다`);
    const prefix = readString(r.prefix, `routes[${i}].prefix`);
    if (firstSegment(prefix) !== prefix) throw new Error(`one-door-many-rooms: routes[${i}].prefix 가 첫 조각 하나가 아니다`);
    const targets = readArray(r.targets, `routes[${i}].targets`).map((x, j) => {
      const id = readString(x, `routes[${i}].targets[${j}]`);
      if (!ids.includes(id)) throw new Error(`one-door-many-rooms: routes[${i}].targets[${j}] ${id} 가 서비스에 없다`);
      return id;
    });
    if (new Set(targets).size !== targets.length) throw new Error(`one-door-many-rooms: routes[${i}].targets 가 겹친다`);
    return { prefix, targets };
  });
  const prefixes = routes.map((r) => r.prefix);
  if (new Set(prefixes).size !== prefixes.length) throw new Error('one-door-many-rooms: 경로표의 첫 조각이 겹친다');

  const requests = readArray(raw.requests, 'requests').map((q, i): GatewayRequest => {
    if (!isRecord(q)) throw new Error(`one-door-many-rooms: requests[${i}] 가 객체가 아니다`);
    const path = readString(q.path, `requests[${i}].path`);
    firstSegment(path);
    return { method: readString(q.method, `requests[${i}].method`), path };
  });

  return { type: 'one-door-many-rooms', stepMs, services, routes, requests };
}

/** 경로표에서 첫 조각과 그대로 같은 줄. 없으면 null — 그것이 404 다. */
export function findRoute(routes: readonly GatewayRoute[], prefix: string): GatewayRoute | null {
  return routes.find((r) => r.prefix === prefix) ?? null;
}

export async function oneDoorManyRooms(ctx: FacetContext<OneDoorManyRoomsFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<OneDoorManyRoomsFacetData>;
  const data = readOneDoorManyRoomsData(ctx.data);
  const { stepMs, services, routes, requests } = data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const serviceAt = (id: string): { index: number; ms: number } => {
    const index = services.findIndex((s) => s.id === id);
    const found = services[index];
    if (found === undefined) throw new Error(`one-door-many-rooms: 서비스 ${id} 가 없다`);
    return { index, ms: found.ms };
  };

  const calls = services.map(() => 0);
  const bump = (index: number): number => {
    const was = calls[index];
    if (was === undefined) throw new Error(`one-door-many-rooms: calls[${index}] 가 없다`);
    calls[index] = was + 1;
    return was + 1;
  };
  await ctx.emit({ type: 'init', payload: { calls: [...calls] }, silent: true });

  for (let req = 0; req < requests.length; req += 1) {
    // 걸음 0 이 이미 읽을 바탕(경로표 · 서비스 · 요청 줄)이라 첫 발신 앞에도 문을 둔다.
    if (!(await pause())) return;
    const request = requests[req];
    if (request === undefined) throw new Error(`one-door-many-rooms: requests[${req}] 가 없다`);
    const prefix = firstSegment(request.path);
    const route = findRoute(routes, prefix);

    if (route === null) {
      await ctx.emit({ type: 'notFound', payload: { req, prefix, status: 404, serviceCalls: 0 } });
      continue;
    }

    if (route.targets.length === 1) {
      const id = route.targets[0];
      if (id === undefined) throw new Error(`one-door-many-rooms: 경로 ${prefix} 의 목록이 비었다`);
      const { index, ms } = serviceAt(id);
      const count = bump(index);
      await ctx.emit({
        type: 'route',
        payload: { req, prefix, service: id, ms, status: 200, calls: count },
      });
      continue;
    }

    // 흩어 보내기 — 목록의 서비스에 한꺼번에.
    const sent = route.targets.map((id, order) => ({ id, order, ...serviceAt(id) }));
    const counts = sent.map((s) => bump(s.index));
    await ctx.emit({
      type: 'scatter',
      payload: { req, prefix, services: [...route.targets], calls: counts },
    });

    // 돌아오는 차례 = 처리 시간 오름차순, 동률은 경로표 목록 차례.
    const back = [...sent].sort((a, b) => a.ms - b.ms || a.order - b.order);
    let got = 0;
    for (const s of back) {
      if (!(await pause())) return;
      got += 1;
      await ctx.emit({
        type: 'gather',
        payload: { req, service: s.id, ms: s.ms, got, of: sent.length },
      });
    }

    if (!(await pause())) return;
    const slowest = Math.max(...sent.map((s) => s.ms));
    await ctx.emit({
      type: 'bundle',
      payload: { req, status: 200, ms: slowest, parts: back.map((s) => s.id) },
    });
  }
}
