/**
 * send-to-idlest — 최소 연결 분배는 새 요청을 받을 서버를 무엇을 보고 고르는가.
 *
 * 걸음 하나 = 틱 하나. 그 틱에 끝나는 연결이 먼저 서버에서 빠지고, 이어서 그 틱의
 * 요청이 도착해 **지금 열린 연결 수가 가장 적은 서버**로 간다. 동률이면 서버 목록의
 * 앞쪽이 이긴다. 받은 총수 · 남은 시간은 고름에 쓰지 않는다 — 끝나는 틱은 빠짐을
 * 셈하려는 자료일 뿐 서버가 아는 값이 아니다.
 *
 * 이벤트
 * - `init` (silent) — 걸음 0 의 바탕
 *     payload: {
 *       rows: { server: string; conns: { id: string; request: string | null }[] }[]
 *         // 처음부터 열린 연결. id 는 `<server>#<k>` (요청이 아니라 request 는 null)
 *       slots: number   // 재생 내내 한 서버에 동시에 열린 연결의 최대 — 칸 폭을 정한다
 *       got: { server: string; n: number }[]   // 새 요청을 받은 수 (모두 0)
 *     }
 * - `tick` — 틱 하나 (걸음 1..N)
 *     payload: {
 *       tick: number
 *       left: { server: string; conn: string }[]     // 이 틱에 끝나 빠진 연결 (빠짐이 먼저)
 *       readings: { server: string; open: number }[] // 빠진 뒤, 고를 때 본 열린 수
 *       request: string    // 이 틱에 도착한 요청
 *       to: string         // 고른 서버
 *       got: number        // 고른 서버가 이제까지 받은 새 요청 수
 *     }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SendToIdlestFacetData = {
  type: 'send-to-idlest';
  stepMs: number;
  /** 서버 식별자. 이 차례가 동률 깨기의 차례다 */
  servers: string[];
  /** 처음부터 열려 있는 연결 — 서버마다 끝나는 틱 */
  openAtStart: { server: string; endsAt: number[] }[];
  /** 새 요청 — 도착 틱과 걸리는 틱 수 */
  requests: { id: string; arrives: number; takes: number }[];
};

function fail(path: string, why: string): never {
  throw new Error(`send-to-idlest: ${path} — ${why}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function posInt(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) fail(path, '1 이상의 정수가 아니다');
  return v;
}

/** 자료 좁히개 — 알고리즘과 장면이 함께 부른다. 어긋나면 필드 경로를 담아 던진다. */
export function narrowSendToIdlestData(raw: unknown): SendToIdlestFacetData {
  if (!isRecord(raw)) fail('initialData', '객체가 아니다');
  if (raw.type !== 'send-to-idlest') fail('initialData.type', `'send-to-idlest' 가 아니다`);
  const stepMs = posInt(raw.stepMs, 'initialData.stepMs');

  if (!Array.isArray(raw.servers) || raw.servers.length === 0) fail('initialData.servers', '빈 배열이거나 배열이 아니다');
  const servers = raw.servers.map((s, i) => {
    if (typeof s !== 'string' || s === '') fail(`initialData.servers[${i}]`, '문자열이 아니다');
    return s;
  });
  if (new Set(servers).size !== servers.length) fail('initialData.servers', '겹치는 식별자가 있다');

  if (!Array.isArray(raw.openAtStart)) fail('initialData.openAtStart', '배열이 아니다');
  const openAtStart = raw.openAtStart.map((o, i) => {
    const p = `initialData.openAtStart[${i}]`;
    if (!isRecord(o)) fail(p, '객체가 아니다');
    if (typeof o.server !== 'string' || !servers.includes(o.server)) fail(`${p}.server`, '서버 목록에 없다');
    if (!Array.isArray(o.endsAt)) fail(`${p}.endsAt`, '배열이 아니다');
    const endsAt = o.endsAt.map((e, k) => posInt(e, `${p}.endsAt[${k}]`));
    return { server: o.server, endsAt };
  });
  if (new Set(openAtStart.map((o) => o.server)).size !== openAtStart.length) {
    fail('initialData.openAtStart', '한 서버가 두 번 나온다');
  }

  if (!Array.isArray(raw.requests) || raw.requests.length === 0) fail('initialData.requests', '빈 배열이거나 배열이 아니다');
  const requests = raw.requests.map((r, i) => {
    const p = `initialData.requests[${i}]`;
    if (!isRecord(r)) fail(p, '객체가 아니다');
    if (typeof r.id !== 'string' || r.id === '') fail(`${p}.id`, '문자열이 아니다');
    const arrives = posInt(r.arrives, `${p}.arrives`);
    // 걸음 하나 = 틱 하나 = 도착 하나. 틱 1 부터 하나씩 도착하는 모양만 받는다
    if (arrives !== i + 1) fail(`${p}.arrives`, `틱 ${i + 1} 이 아니다 — 틱마다 하나씩 도착하는 모양만 받는다`);
    const takes = posInt(r.takes, `${p}.takes`);
    return { id: r.id, arrives, takes };
  });
  if (new Set(requests.map((r) => r.id)).size !== requests.length) fail('initialData.requests', '겹치는 식별자가 있다');

  return { type: 'send-to-idlest', stepMs, servers, openAtStart, requests };
}

/**
 * 열린 수가 가장 적은 서버. 동률이면 목록 앞쪽. readings 는 서버 목록 차례다.
 */
export function pickIdlest(readings: readonly { server: string; open: number }[]): string {
  const first = readings[0];
  if (first === undefined) fail('readings', '비었다');
  let best = first;
  for (const r of readings) {
    if (r.open < best.open) best = r;
  }
  return best.server;
}

type OpenConn = { id: string; request: string | null; endsAt: number };

type TickPlan = {
  tick: number;
  left: { server: string; conn: string }[];
  readings: { server: string; open: number }[];
  request: string;
  to: string;
  got: number;
};

type Plan = {
  rows: { server: string; conns: { id: string; request: string | null }[] }[];
  slots: number;
  ticks: TickPlan[];
};

/** 재생 전체를 먼저 셈한다 — 칸 폭(slots)이 끝까지 가 봐야 정해지기 때문이다. */
function planRun(data: SendToIdlestFacetData): Plan {
  const open = new Map<string, OpenConn[]>();
  for (const s of data.servers) open.set(s, []);
  for (const o of data.openAtStart) {
    const row = open.get(o.server);
    if (row === undefined) fail(`openAtStart.${o.server}`, '서버 목록에 없다');
    o.endsAt.forEach((endsAt, k) => row.push({ id: `${o.server}#${k}`, request: null, endsAt }));
  }
  const rowOf = (s: string): OpenConn[] => {
    const row = open.get(s);
    if (row === undefined) fail(`open.${s}`, '서버 목록에 없다');
    return row;
  };

  const rows = data.servers.map((s) => ({
    server: s,
    conns: rowOf(s).map((c) => ({ id: c.id, request: c.request })),
  }));
  let slots = Math.max(...data.servers.map((s) => rowOf(s).length));
  const got = new Map<string, number>(data.servers.map((s) => [s, 0]));

  const ticks: TickPlan[] = [];
  for (const req of data.requests) {
    const tick = req.arrives;
    // 빠짐이 먼저 — 이 틱에 끝나는 연결
    const left: { server: string; conn: string }[] = [];
    for (const s of data.servers) {
      const row = rowOf(s);
      for (const c of row.filter((c) => c.endsAt === tick)) left.push({ server: s, conn: c.id });
      open.set(s, row.filter((c) => c.endsAt !== tick));
    }
    // 도착이 나중 — 지금 열린 수 하나만 보고 고른다
    const readings = data.servers.map((s) => ({ server: s, open: rowOf(s).length }));
    const to = pickIdlest(readings);
    rowOf(to).push({ id: req.id, request: req.id, endsAt: tick + req.takes });
    const n = (got.get(to) ?? fail(`got.${to}`, '서버 목록에 없다')) + 1;
    got.set(to, n);
    slots = Math.max(slots, rowOf(to).length);
    ticks.push({ tick, left, readings, request: req.id, to, got: n });
  }
  return { rows, slots, ticks };
}

export async function sendToIdlest(context: FacetContext<SendToIdlestFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<SendToIdlestFacetData>;
  const data = narrowSendToIdlestData(ctx.data);
  const stepMs = data.stepMs;
  const plan = planRun(data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      rows: plan.rows,
      slots: plan.slots,
      got: data.servers.map((s) => ({ server: s, n: 0 })),
    },
  });

  // 걸음 0 은 이미 읽을 것(열린 연결 · 도착 차례)이 있다 — 첫 틱 앞에도 stepMs 를 둔다
  for (const tk of plan.ticks) {
    if (!(await pause())) return;
    await ctx.emit({
      type: 'tick',
      payload: {
        tick: tk.tick,
        left: tk.left,
        readings: tk.readings,
        request: tk.request,
        to: tk.to,
        got: tk.got,
      },
    });
  }
}
