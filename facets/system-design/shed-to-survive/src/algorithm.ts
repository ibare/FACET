/**
 * shed-to-survive — 같은 도착을 두 서버가 받는다. 하나는 다 받고, 하나는 한도를 넘으면 곧바로 거절한다.
 *
 * 모형 (틱 t 하나 안의 차례)
 *   ① 틱 t−1..t 의 일: 서버의 힘(틱당 capacity)을 그 틱 시작에 들고 있는 요청 수로 똑같이 나눠 더한다
 *      (틱 0 에는 없다). 떠난 손님의 요청도 들고 있는 것에 든다 — 서버는 취소를 모른다.
 *      누적이 work 가 되면 끝. 기한 안이면 "끝"(ok), 손님이 떠난 뒤면 헛일(wasted). 넘으면 던진다.
 *   ② 끝나지 않았고 t − 도착 ≥ deadline 이면 손님이 떠난다 (gone — 일은 서버에 남는다)
 *   ③ 틱 t 의 도착을 자료의 차례로 받는다. 거절하는 쪽은 들고 있는 수가 limit 이상이면 거절(reject)
 *   손님이 기다리는 요청이 두 서버 어디에도 없고 남은 도착이 없으면 그 틱에서 멈춘다.
 *   몫 · 누적은 분수로 셈한다. 표시만 반올림한다.
 *
 * 이벤트
 *   init (silent) — 걸음 0 의 계기값
 *     { accept: { held: 0; ok: 0; gone: 0 }; shed: { held: 0; ok: 0; rej: 0 } }
 *     (셈의 출발값이라 장면이 지어내지 않고 알고리즘이 싣는다)
 *   tick — 틱 하나 (걸음 하나)
 *     {
 *       tick: number;
 *       last: boolean;                        // 이 틱에서 멈추는가
 *       accept: {
 *         split: number;                      // ① 에서 나눈 수 (일이 없으면 0)
 *         worked: { id; was; done }[];        // ① 에서 몫을 받은 요청 (was → done)
 *         finished: string[];                 // ① 에서 끝난 것 (기한 안)
 *         wasted: string[];                   // ① 에서 끝났으나 손님이 이미 떠난 것
 *         left: string[];                     // ② 에서 떠난 손님
 *         took: string[];                     // ③ 에서 받은 것
 *         rejected: string[];                 // 늘 빈 배열 (다 받는 쪽)
 *         reqs: { id; done; state: 'run' | 'gone' | 'ok' | 'wasted'; age }[];   // 틱 끝의 모습 (받은 차례)
 *         held: number; ok: number; gone: number;
 *       };
 *       shed: {
 *         split: number;
 *         worked: { id; was; done }[];
 *         finished: string[]; wasted: string[]; left: string[];
 *         took: string[];
 *         rejected: string[];                 // ③ 에서 거절한 것
 *         holding: { id; done; state: 'run' | 'gone'; age }[];  // 틱 끝에 들고 있는 것
 *         held: number; ok: number; rej: number;
 *       };
 *       summary: { accept: number; shed: number; total: number } | null;   // last 일 때만
 *     }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ShedToSurviveFacetData = {
  type: 'shed-to-survive';
  stepMs: number;
  /** 틱마다의 도착. 같은 틱 안은 적힌 차례로 받는다. */
  arrivals: { tick: number; ids: string[] }[];
  /** 요청 하나의 일 (단위) */
  work: number;
  /** 서버의 힘 (틱당 단위, 두 서버 같다) */
  capacity: number;
  /** 도착 틱 + deadline 까지 끝나지 않으면 손님이 떠난다 */
  deadline: number;
  /** 거절하는 쪽이 동시에 들고 있는 요청의 한도 */
  limit: number;
  /** 거절 응답 — HTTP 상태 코드라 번역하지 않는 자료 */
  code: string;
};

function isPosInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

/** 자료의 모양을 검사한다. 어긋나면 필드 경로를 담아 던진다. 장면 · 그림도 이것을 부른다. */
export function narrowShedData(raw: unknown): ShedToSurviveFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('shed-to-survive: initialData 가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'shed-to-survive') throw new Error(`shed-to-survive: initialData.type 이 틀렸다 (${String(d.type)})`);
  if (typeof d.stepMs !== 'number' || !(d.stepMs >= 0)) throw new Error('shed-to-survive: initialData.stepMs');
  for (const k of ['work', 'capacity', 'deadline', 'limit'] as const) {
    if (!isPosInt(d[k])) throw new Error(`shed-to-survive: initialData.${k} 는 양의 정수여야 한다`);
  }
  if (typeof d.code !== 'string' || d.code === '') throw new Error('shed-to-survive: initialData.code');
  if (!Array.isArray(d.arrivals) || d.arrivals.length === 0) throw new Error('shed-to-survive: initialData.arrivals');
  const seen = new Set<string>();
  let prevTick = -1;
  const arrivals = d.arrivals.map((g: unknown, gi: number) => {
    if (typeof g !== 'object' || g === null) throw new Error(`shed-to-survive: arrivals[${gi}]`);
    const gg = g as Record<string, unknown>;
    const tick = gg.tick;
    if (typeof tick !== 'number' || !Number.isInteger(tick) || tick <= prevTick) {
      throw new Error(`shed-to-survive: arrivals[${gi}].tick 는 앞보다 큰 정수여야 한다`);
    }
    prevTick = tick;
    if (!Array.isArray(gg.ids) || gg.ids.length === 0) throw new Error(`shed-to-survive: arrivals[${gi}].ids`);
    const ids = gg.ids.map((id: unknown, ii: number) => {
      if (typeof id !== 'string' || id === '') throw new Error(`shed-to-survive: arrivals[${gi}].ids[${ii}]`);
      if (seen.has(id)) throw new Error(`shed-to-survive: arrivals[${gi}].ids[${ii}] 가 겹친다 (${id})`);
      seen.add(id);
      return id;
    });
    return { tick, ids };
  });
  return {
    type: 'shed-to-survive',
    stepMs: d.stepMs,
    arrivals,
    work: d.work as number,
    capacity: d.capacity as number,
    deadline: d.deadline as number,
    limit: d.limit as number,
    code: d.code,
  };
}

/** 받은 차례대로의 요청 식별자. */
export function requestOrder(data: ShedToSurviveFacetData): string[] {
  return data.arrivals.flatMap((g) => g.ids);
}

// ── 분수 ────────────────────────────────────────────────────────────

type Frac = { n: number; d: number };

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) [x, y] = [y, x % y];
  return x;
}
function frac(n: number, d: number): Frac {
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}
function add(a: Frac, b: Frac): Frac {
  return frac(a.n * b.d + b.n * a.d, a.d * b.d);
}
/** a 와 정수 w 를 견준다: 음수 · 0 · 양수 */
function cmpInt(a: Frac, w: number): number {
  return a.n - w * a.d;
}

// ── 한 서버의 셈 ────────────────────────────────────────────────────

type ReqState = 'run' | 'gone' | 'ok' | 'wasted' | 'reject';
type Req = { id: string; arr: number; done: Frac; state: ReqState };

type TickOutcome = {
  split: number;
  worked: { id: string; was: number; done: number }[];
  finished: string[];
  wasted: string[];
  left: string[];
  took: string[];
  rejected: string[];
};

class Server {
  readonly reqs: Req[] = [];
  constructor(
    private readonly data: ShedToSurviveFacetData,
    /** 한도. 없으면 다 받는다 */
    private readonly limit: number | null,
  ) {}

  private holdingList(): Req[] {
    return this.reqs.filter((r) => r.state === 'run' || r.state === 'gone');
  }

  step(tick: number, arriving: string[]): TickOutcome {
    const out: TickOutcome = { split: 0, worked: [], finished: [], wasted: [], left: [], took: [], rejected: [] };
    // ① 지난 틱의 일
    if (tick > 0) {
      const live = this.holdingList();
      if (live.length > 0) {
        out.split = live.length;
        const share = frac(this.data.capacity, live.length);
        for (const r of live) {
          const was = r.done;
          r.done = add(r.done, share);
          const c = cmpInt(r.done, this.data.work);
          if (c > 0) throw new Error(`shed-to-survive: ${r.id} 가 한 틱 안에서 일을 넘겨 끝났다 — 이 모형 밖이다 (틱 ${tick})`);
          out.worked.push({ id: r.id, was: was.n / was.d, done: r.done.n / r.done.d });
          if (c === 0) {
            if (r.state === 'run') {
              if (tick - r.arr > this.data.deadline) throw new Error(`shed-to-survive: ${r.id} 가 기한 뒤에 손님이 남아 있다`);
              r.state = 'ok';
              out.finished.push(r.id);
            } else {
              r.state = 'wasted';
              out.wasted.push(r.id);
            }
          }
        }
      }
    }
    // ② 기한
    for (const r of this.reqs) {
      if (r.state === 'run' && tick - r.arr >= this.data.deadline) {
        r.state = 'gone';
        out.left.push(r.id);
      }
    }
    // ③ 도착
    for (const id of arriving) {
      const held = this.holdingList().length;
      if (this.limit !== null && held >= this.limit) {
        this.reqs.push({ id, arr: tick, done: frac(0, 1), state: 'reject' });
        out.rejected.push(id);
      } else {
        this.reqs.push({ id, arr: tick, done: frac(0, 1), state: 'run' });
        out.took.push(id);
      }
    }
    if (this.limit !== null && this.holdingList().length > this.limit) {
      throw new Error(`shed-to-survive: 거절하는 쪽이 한도를 넘겨 들고 있다 (틱 ${tick})`);
    }
    return out;
  }

  count(s: ReqState): number {
    return this.reqs.filter((r) => r.state === s).length;
  }
  held(): number {
    return this.holdingList().length;
  }
  waiting(): boolean {
    return this.reqs.some((r) => r.state === 'run');
  }
  snapshot(tick: number): { id: string; done: number; state: 'run' | 'gone' | 'ok' | 'wasted'; age: number }[] {
    const rows: { id: string; done: number; state: 'run' | 'gone' | 'ok' | 'wasted'; age: number }[] = [];
    for (const r of this.reqs) {
      if (r.state === 'reject') continue;
      rows.push({ id: r.id, done: r.done.n / r.done.d, state: r.state, age: tick - r.arr });
    }
    return rows;
  }
}

export async function shedToSurvive(ctxIn: FacetContext<ShedToSurviveFacetData>): Promise<void> {
  const ctx = ctxIn as ReactiveContext<ShedToSurviveFacetData>;
  const data = narrowShedData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const accept = new Server(data, null);
  const shed = new Server(data, data.limit);
  const total = requestOrder(data).length;
  const lastGroup = data.arrivals.at(-1);
  if (lastGroup === undefined) throw new Error('shed-to-survive: 도착이 없다');
  const lastArrival = lastGroup.tick;
  // 손님은 늦어도 도착 + deadline 에 떠나므로 이 틱을 넘길 수 없다
  const bound = lastArrival + data.deadline;

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { accept: { held: 0, ok: 0, gone: 0 }, shed: { held: 0, ok: 0, rej: 0 } },
  });

  for (let tick = 0; ; tick += 1) {
    if (!(await pause())) return;
    if (tick > bound) throw new Error(`shed-to-survive: 틱 ${tick} 가 한계 ${bound} 를 넘었다`);
    const group = data.arrivals.find((g) => g.tick === tick);
    const arriving = group === undefined ? [] : group.ids;
    const a = accept.step(tick, arriving);
    const b = shed.step(tick, arriving);
    if (a.rejected.length > 0) throw new Error('shed-to-survive: 다 받는 쪽이 거절했다');
    const last = tick >= lastArrival && !accept.waiting() && !shed.waiting();
    await ctx.emit({
      type: 'tick',
      payload: {
        tick,
        last,
        accept: {
          split: a.split,
          worked: a.worked,
          finished: a.finished,
          wasted: a.wasted,
          left: a.left,
          took: a.took,
          rejected: a.rejected,
          reqs: accept.snapshot(tick),
          held: accept.held(),
          ok: accept.count('ok'),
          gone: accept.count('gone') + accept.count('wasted'),
        },
        shed: {
          split: b.split,
          worked: b.worked,
          finished: b.finished,
          wasted: b.wasted,
          left: b.left,
          took: b.took,
          rejected: b.rejected,
          holding: shed.snapshot(tick).filter((r) => r.state === 'run' || r.state === 'gone'),
          held: shed.held(),
          ok: shed.count('ok'),
          rej: shed.count('reject'),
        },
        summary: last ? { accept: accept.count('ok'), shed: shed.count('ok'), total } : null,
      },
    });
    if (last) return;
  }
}
