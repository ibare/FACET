/**
 * jitteredBackoff — 한 순간에 함께 실패한 클라이언트들이 기다렸다 다시 올 때, 기다림을 흩으면 무엇이 달라지는가.
 *
 * 두 세계를 나란히 셈한다. 둘 다 여덟 클라이언트가 칸 0 에 함께 온다.
 * - `plain`  (흩지 않음) — k 번째 실패한 클라이언트의 기다림 = 창 = windowBase^k 칸
 * - `jitter` (흩음)      — 기다림 = 1 + floor(x · 창 / m), x 는 선형 합동 생성기의 다음 값
 *   (x ← (a · x + c) mod m, 씨앗 seed. 뽑을 때마다 먼저 x 를 넘기고 그 x 를 쓴다.
 *    뽑기 차례는 칸이 이른 것부터, 한 칸 안에서는 실패한 차례)
 * 한 칸에 찾아온 클라이언트는 번호 차례(자료의 clients 차례)로 앞의 capacity 개가 받고 나머지가 실패한다.
 * 실패한 클라이언트의 다음 칸 = 지금 칸 + 기다림. 새 클라이언트는 없다.
 *
 * 걸음 = 어느 한쪽에라도 찾아오는 클라이언트가 있는 칸 하나. 아무도 오지 않는 칸은 건너뛴다.
 *
 * 이벤트
 * - `init`  (silent) — 걸음 0 의 바탕을 갈아 끼운다
 *     payload: { lastCell: number }   두 세계 가운데 가장 늦게 끝나는 칸 (칸 축의 끝)
 * - `visit` — 찾아오는 클라이언트가 있는 칸 하나
 *     payload: {
 *       cell: number,
 *       plain:  WorldVisit,
 *       jitter: WorldVisit,
 *     }
 *     WorldVisit = {
 *       arrived: string[],          // 이 칸에 찾아온 클라이언트 (번호 차례). 없으면 []
 *       served:  string[],          // 받은 클라이언트 (arrived 의 앞 capacity 개)
 *       failed:  Array<{ id: string, k: number, window: number, wait: number, next: number, x: number | null }>,
 *                                   // 실패한 클라이언트. k = 그 클라이언트의 실패 횟수, next = cell + wait,
 *                                   // x = 흩는 쪽이 뽑은 생성기 값 (흩지 않는 쪽은 null)
 *       done:    boolean,           // 이 칸 뒤 그 세계의 클라이언트를 서버가 모두 받아 줬는가
 *     }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type WorldId = 'plain' | 'jitter';
export const WORLD_IDS: readonly WorldId[] = ['plain', 'jitter'];

export interface JitteredBackoffFacetData {
  type: 'jittered-backoff';
  stepMs: number;
  /** 클라이언트 식별자. 이 차례가 번호 차례다 */
  clients: string[];
  /** 모두가 처음 함께 오는 칸 */
  firstCell: number;
  /** 서버가 한 칸에 받는 수 */
  capacity: number;
  /** k 번째 실패의 창 = windowBase^k 칸 */
  windowBase: number;
  /** 선형 합동 생성기 x ← (a · x + c) mod m 과 씨앗 */
  lcg: { a: number; c: number; m: number; seed: number };
}

export interface Failure {
  id: string;
  k: number;
  window: number;
  wait: number;
  next: number;
  x: number | null;
}

export interface WorldVisit {
  arrived: string[];
  served: string[];
  failed: Failure[];
  done: boolean;
}

export interface CellVisit {
  cell: number;
  plain: WorldVisit;
  jitter: WorldVisit;
}

export interface JitteredBackoffRun {
  visits: CellVisit[];
  lastCell: number;
}

function wholeNumber(value: unknown, path: string, min: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
    throw new Error(`jitteredBackoff: ${path} 는 ${min} 이상의 정수여야 한다 (받은 값: ${String(value)})`);
  }
  return value;
}

/** 자료의 모양을 검사하고 어긋나면 던진다. 값을 베껴 돌려준다. */
export function readJitteredBackoffData(raw: unknown): JitteredBackoffFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('jitteredBackoff: 자료가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'jittered-backoff') throw new Error(`jitteredBackoff: type 이 jittered-backoff 가 아니다 (${String(d.type)})`);
  const stepMs = wholeNumber(d.stepMs, 'stepMs', 1);
  if (!Array.isArray(d.clients) || d.clients.length === 0) throw new Error('jitteredBackoff: clients 가 비었거나 배열이 아니다');
  const clients: string[] = [];
  for (const [i, c] of d.clients.entries()) {
    if (typeof c !== 'string' || c.length === 0) throw new Error(`jitteredBackoff: clients[${i}] 가 식별자가 아니다`);
    if (clients.includes(c)) throw new Error(`jitteredBackoff: clients[${i}] 식별자 ${c} 가 겹친다`);
    clients.push(c);
  }
  const firstCell = wholeNumber(d.firstCell, 'firstCell', 0);
  const capacity = wholeNumber(d.capacity, 'capacity', 1);
  const windowBase = wholeNumber(d.windowBase, 'windowBase', 2);
  if (typeof d.lcg !== 'object' || d.lcg === null) throw new Error('jitteredBackoff: lcg 가 객체가 아니다');
  const g = d.lcg as Record<string, unknown>;
  const lcg = {
    a: wholeNumber(g.a, 'lcg.a', 1),
    c: wholeNumber(g.c, 'lcg.c', 0),
    m: wholeNumber(g.m, 'lcg.m', 2),
    seed: wholeNumber(g.seed, 'lcg.seed', 0),
  };
  if (lcg.seed >= lcg.m) throw new Error('jitteredBackoff: lcg.seed 가 lcg.m 보다 작아야 한다');
  return { type: 'jittered-backoff', stepMs, clients, firstCell, capacity, windowBase, lcg };
}

/** 한쪽 세계의 진행 — 다음 칸 · 실패 횟수 · 받힌 칸 */
interface WorldRun {
  next: Map<string, number>;
  fails: Map<string, number>;
  served: Set<string>;
}

/** 걸음 하나에 셈이 끝없이 늘어나지 않게 — 이 자료의 칸 축 상한 */
const CELL_LIMIT = 10_000;

/** 두 세계를 칸마다 나란히 셈한다. 아무도 오지 않는 칸은 기록하지 않는다. */
export function simulateJitteredBackoff(data: JitteredBackoffFacetData): JitteredBackoffRun {
  const { clients, capacity, windowBase, lcg } = data;
  const worlds: Record<WorldId, WorldRun> = {
    plain: { next: new Map(), fails: new Map(), served: new Set() },
    jitter: { next: new Map(), fails: new Map(), served: new Set() },
  };
  for (const w of WORLD_IDS) {
    for (const c of clients) {
      worlds[w].next.set(c, data.firstCell);
      worlds[w].fails.set(c, 0);
    }
  }
  let x = lcg.seed;
  const draw = (): number => {
    x = (lcg.a * x + lcg.c) % lcg.m;
    return x;
  };

  const visits: CellVisit[] = [];
  let lastCell = data.firstCell;
  for (let cell = data.firstCell; ; cell += 1) {
    if (WORLD_IDS.every((w) => worlds[w].served.size === clients.length)) break;
    if (cell > CELL_LIMIT) throw new Error(`jitteredBackoff: 칸 ${CELL_LIMIT} 을 넘도록 끝나지 않는다`);
    const record = {} as Record<WorldId, WorldVisit>;
    for (const w of WORLD_IDS) {
      const world = worlds[w];
      const arrived = clients.filter((c) => !world.served.has(c) && world.next.get(c) === cell);
      const served: string[] = [];
      const failed: Failure[] = [];
      for (const [i, c] of arrived.entries()) {
        if (i < capacity) {
          world.served.add(c);
          served.push(c);
          continue;
        }
        const was = world.fails.get(c);
        if (was === undefined) throw new Error(`jitteredBackoff: ${c} 의 실패 횟수가 없다`);
        const k = was + 1;
        world.fails.set(c, k);
        const window = windowBase ** k;
        let wait: number;
        let drawn: number | null = null;
        if (w === 'jitter') {
          drawn = draw();
          wait = 1 + Math.floor((drawn * window) / lcg.m);
        } else {
          wait = window;
        }
        const next = cell + wait;
        world.next.set(c, next);
        failed.push({ id: c, k, window, wait, next, x: drawn });
      }
      if (served.length > 0) lastCell = Math.max(lastCell, cell);
      record[w] = { arrived, served, failed, done: world.served.size === clients.length };
    }
    if (record.plain.arrived.length === 0 && record.jitter.arrived.length === 0) continue;
    visits.push({ cell, plain: record.plain, jitter: record.jitter });
  }
  return { visits, lastCell };
}

export async function jitteredBackoff(context: FacetContext<JitteredBackoffFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<JitteredBackoffFacetData>;
  const data = readJitteredBackoffData(ctx.data);
  const { stepMs } = data;
  const run = simulateJitteredBackoff(data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({ type: 'init', payload: { lastCell: run.lastCell }, silent: true });

  // 걸음 0 은 칸 0 앞에 선 여덟이 이미 읽을 것이다 — 첫 칸 앞에도 문을 둔다
  for (const visit of run.visits) {
    if (!(await pause())) return;
    await ctx.emit({ type: 'visit', payload: visit });
  }
}
