/**
 * 캐시 일관성 — 한 서버가 값을 고칠 때 남의 사본을 어떻게 하나.
 *
 * 서버 넷이 같은 키(`qty:31`)의 사본을 캐시에 들고, 원본은 DB 에 있다. 한 판은 쓰는 서버가
 * 잇달아 `run` 번 쓰고(쓰기마다 DB −1, 제 캐시에 write-through) 읽는 서버 셋이 한 번씩 읽는다.
 * 네 판을 잇는다(캐시는 판 사이에 이어진다).
 *
 * 알리는 법(policy):
 *   0 알림 없음 — 아무것도 보내지 않는다. 다른 사본은 옛값으로 남는다
 *   1 무효화    — 그 키를 **들고 있는** 다른 서버에 값 없는 "버려라" 한 통씩, 받은 칸은 빈다
 *   2 갱신      — 들고 있는 다른 서버에 새 값을 실은 한 통씩, 받은 칸은 새 값이 된다
 * 읽기: 빈 칸이면 DB 에서 가져와 채운다(DB 읽기 +1), 아니면 캐시 값. 옛값 = 돌려준 값 ≠ 그때 DB.
 * 셈은 모두 정수다. 동률 · 반올림 자리가 없다.
 *
 * ── 이벤트 (payload 스키마 · silent 여부)
 *   init  (silent) — 판 머리. 걸음 0 을 갈아 끼운다.
 *     { servers: string[]; writer: number; readers: number[]; key: string; db: number;
 *       cache: (number | null)[]; policy: 0|1|2; run: number; rounds: number; motionMs: number;
 *       tileAxis: number }   // tileAxis = 사다리 전체에서 셈한 계기 끝값의 가장 큰 것(통 줄의 칸 수)
 *   phase (silent) — { phase: CoherencePhase }. 걸음 발신 바로 앞에 하나.
 *   write — 쓰기 하나(알림 포함).
 *     { round: number(1..); index: number(1..run); run: number; writer: number; db: number;
 *       targets: number[]; carry: number | null; cache: (number | null)[];
 *       messages: number; dbReads: number; staleReads: number }
 *     carry — 갱신 통이 실은 값. 무효화 · 알림 없음이면 null (무효화 통은 값을 싣지 않는다)
 *   read — 읽기 하나.
 *     { round: number(1..); reader: number; value: number; db: number; refill: boolean; stale: boolean;
 *       cache: (number | null)[]; messages: number; dbReads: number; staleReads: number }
 *
 * ── phase 어휘 (irs.ts 와 같다)
 *   write · invalidate · update · refill · read
 *   걸음의 대표: 쓰기 걸음은 통을 보냈으면 invalidate/update, 아니면 write.
 *                읽기 걸음은 DB 에 갔으면 refill, 아니면 read.
 *
 * ── 계기 (판마다 0 에서, 지금 값을 들고 차이만 보낸다)
 *   messages   — 건너간 통
 *   db-reads   — DB 에 간 읽기
 *   stale-reads — 옛값 읽기
 *
 * ── 손잡이 (reactive)
 *   notify — 0 · 1 · 2 (알리는 법)      run — 1 · 2 · 3 · 4 · 6 (잇단 쓰기)
 *   한 판을 끝까지 재생 → waitForInput → 받은 값으로 다시 재생.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CacheCoherenceData = {
  type: 'cache-coherence';
  stepMs: number;
  motionMs: number;
  servers: string[];
  writer: string;
  readers: string[];
  key: string;
  start: number;
  rounds: number;
  notifies: number[];
  runs: number[];
  defaultNotify: number;
  defaultRun: number;
};

export type CoherencePhase = 'write' | 'invalidate' | 'update' | 'refill' | 'read';

export type CoherenceTotals = { messages: number; dbReads: number; staleReads: number };

export type CoherenceStep =
  | {
      kind: 'write';
      phase: CoherencePhase;
      round: number;
      index: number;
      db: number;
      targets: number[];
      carry: number | null;
      cache: (number | null)[];
      totals: CoherenceTotals;
    }
  | {
      kind: 'read';
      phase: CoherencePhase;
      round: number;
      reader: number;
      value: number;
      db: number;
      refill: boolean;
      stale: boolean;
      cache: (number | null)[];
      totals: CoherenceTotals;
    };

export type CoherencePlay = { steps: CoherenceStep[]; totals: CoherenceTotals; endDb: number };

function fail(what: string): never {
  throw new Error(`cache-coherence: ${what}`);
}

function readInt(raw: Record<string, unknown>, name: string): number {
  const v = raw[name];
  if (typeof v !== 'number' || !Number.isInteger(v)) fail(`${name} 가 정수가 아니다`);
  return v;
}

function readStr(raw: Record<string, unknown>, name: string): string {
  const v = raw[name];
  if (typeof v !== 'string' || v.length === 0) fail(`${name} 가 문자열이 아니다`);
  return v;
}

function readStrList(raw: Record<string, unknown>, name: string): string[] {
  const v = raw[name];
  if (!Array.isArray(v) || v.length === 0) fail(`${name} 가 빈 목록이거나 목록이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'string' || x.length === 0) fail(`${name}[${i}] 가 문자열이 아니다`);
    return x;
  });
}

function readIntList(raw: Record<string, unknown>, name: string): number[] {
  const v = raw[name];
  if (!Array.isArray(v) || v.length === 0) fail(`${name} 가 빈 목록이거나 목록이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'number' || !Number.isInteger(x)) fail(`${name}[${i}] 가 정수가 아니다`);
    return x;
  });
}

/** `ctx.data` 좁히개 — 모양이 어긋나면 무엇이 어긋났는지 담아 던진다. */
export function readCoherenceData(raw: unknown): CacheCoherenceData {
  if (typeof raw !== 'object' || raw === null) fail('data 가 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'cache-coherence') fail(`type 이 cache-coherence 가 아니다: ${String(r.type)}`);
  const servers = readStrList(r, 'servers');
  if (new Set(servers).size !== servers.length) fail('servers 에 겹치는 이름이 있다');
  const writer = readStr(r, 'writer');
  if (!servers.includes(writer)) fail(`writer ${writer} 가 servers 에 없다`);
  const readers = readStrList(r, 'readers');
  for (const s of readers) {
    if (!servers.includes(s)) fail(`reader ${s} 가 servers 에 없다`);
    if (s === writer) fail(`reader ${s} 가 쓰는 서버다`);
  }
  const notifies = readIntList(r, 'notifies');
  for (const p of notifies) if (p < 0 || p > 2) fail(`notifies 에 모르는 값 ${p}`);
  const runs = readIntList(r, 'runs');
  for (const n of runs) if (n < 1) fail(`runs 에 1 보다 작은 값 ${n}`);
  const defaultNotify = readInt(r, 'defaultNotify');
  if (!notifies.includes(defaultNotify)) fail(`defaultNotify ${defaultNotify} 가 사다리에 없다`);
  const defaultRun = readInt(r, 'defaultRun');
  if (!runs.includes(defaultRun)) fail(`defaultRun ${defaultRun} 가 사다리에 없다`);
  const rounds = readInt(r, 'rounds');
  if (rounds < 1) fail('rounds 가 1 보다 작다');
  const stepMs = readInt(r, 'stepMs');
  const motionMs = readInt(r, 'motionMs');
  if (stepMs < 0 || motionMs < 0) fail('stepMs · motionMs 가 음수다');
  return {
    type: 'cache-coherence',
    stepMs,
    motionMs,
    servers,
    writer,
    readers,
    key: readStr(r, 'key'),
    start: readInt(r, 'start'),
    rounds,
    notifies,
    runs,
    defaultNotify,
    defaultRun,
  };
}

/**
 * 한 판(네 회)을 셈한다. 캐시 칸의 빈 자리는 null.
 * policy 가 0..2 밖이거나 run 이 1 보다 작으면 던진다 (IR 은 −1).
 */
export function simulateCoherence(data: CacheCoherenceData, policy: number, run: number): CoherencePlay {
  if (policy !== 0 && policy !== 1 && policy !== 2) fail(`모르는 알리는 법 ${policy}`);
  if (!Number.isInteger(run) || run < 1) fail(`잇단 쓰기 ${run} 가 1 보다 작다`);
  const writer = data.servers.indexOf(data.writer);
  const readers = data.readers.map((s) => data.servers.indexOf(s));
  const cache: (number | null)[] = data.servers.map(() => data.start);
  let db = data.start;
  const totals: CoherenceTotals = { messages: 0, dbReads: 0, staleReads: 0 };
  const steps: CoherenceStep[] = [];
  for (let k = 1; k <= data.rounds; k += 1) {
    for (let w = 1; w <= run; w += 1) {
      db -= 1;
      cache[writer] = db;
      const targets: number[] = [];
      for (let i = 0; i < cache.length; i += 1) {
        if (i === writer || cache[i] === null) continue;
        if (policy === 1) {
          cache[i] = null;
          targets.push(i);
        } else if (policy === 2) {
          cache[i] = db;
          targets.push(i);
        }
      }
      totals.messages += targets.length;
      let stepPhase: CoherencePhase = 'write';
      if (targets.length > 0) stepPhase = policy === 1 ? 'invalidate' : 'update';
      steps.push({
        kind: 'write',
        phase: stepPhase,
        round: k,
        index: w,
        db,
        targets,
        carry: policy === 2 ? db : null,
        cache: [...cache],
        totals: { ...totals },
      });
    }
    for (const reader of readers) {
      let refill = false;
      const held = cache[reader];
      let value: number;
      if (held === undefined) fail(`읽는 서버 ${reader} 의 칸이 없다`);
      if (held === null) {
        value = db;
        cache[reader] = db;
        totals.dbReads += 1;
        refill = true;
      } else {
        value = held;
      }
      const stale = value !== db;
      if (stale) totals.staleReads += 1;
      steps.push({
        kind: 'read',
        phase: refill ? 'refill' : 'read',
        round: k,
        reader,
        value,
        db,
        refill,
        stale,
        cache: [...cache],
        totals: { ...totals },
      });
    }
  }
  return { steps, totals: { ...totals }, endDb: db };
}

/** 사다리 전체에서 계기 끝값의 가장 큰 것 — 통 줄의 칸 수(축). */
export function coherenceTileAxis(data: CacheCoherenceData): number {
  let most = 0;
  for (const p of data.notifies) {
    for (const n of data.runs) {
      const { totals } = simulateCoherence(data, p, n);
      most = Math.max(most, totals.messages, totals.dbReads, totals.staleReads);
    }
  }
  if (most < 1) fail('축이 0 이다');
  return most;
}

function knobValue(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const v = (payload as Record<string, unknown>).value;
  return typeof v === 'number' ? v : null;
}

export async function cacheCoherenceAlgorithm(ctx: FacetContext<CacheCoherenceData>): Promise<void> {
  const rctx = ctx as ReactiveContext<CacheCoherenceData>;
  const data = readCoherenceData(ctx.data);
  const writer = data.servers.indexOf(data.writer);
  const readers = data.readers.map((s) => data.servers.indexOf(s));
  const tileAxis = coherenceTileAxis(data);
  let policy = data.defaultNotify;
  let run = data.defaultRun;

  const shown = new Map<string, number>();
  const show = (name: 'messages' | 'db-reads' | 'stale-reads', value: number): void => {
    const before = shown.get(name);
    shown.set(name, value);
    ctx.metric(name, before === undefined ? value : value - before);
  };
  const phase = async (p: CoherencePhase): Promise<void> => {
    switch (p) {
      case 'write':
        await ctx.emit({ type: 'phase', payload: { phase: 'write' }, silent: true });
        return;
      case 'invalidate':
        await ctx.emit({ type: 'phase', payload: { phase: 'invalidate' }, silent: true });
        return;
      case 'update':
        await ctx.emit({ type: 'phase', payload: { phase: 'update' }, silent: true });
        return;
      case 'refill':
        await ctx.emit({ type: 'phase', payload: { phase: 'refill' }, silent: true });
        return;
      case 'read':
        await ctx.emit({ type: 'phase', payload: { phase: 'read' }, silent: true });
        return;
    }
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const play = simulateCoherence(data, policy, run);
      await ctx.emit({
        type: 'init',
        payload: {
          servers: [...data.servers],
          writer,
          readers: [...readers],
          key: data.key,
          db: data.start,
          cache: data.servers.map(() => data.start),
          policy,
          run,
          rounds: data.rounds,
          motionMs: data.motionMs,
          tileAxis,
        },
        silent: true,
      });
      show('messages', 0);
      show('db-reads', 0);
      show('stale-reads', 0);

      for (const step of play.steps) {
        if (ctx.cancelled) return;
        await phase(step.phase);
        if (step.kind === 'write') {
          await ctx.emit({
            type: 'write',
            payload: {
              round: step.round,
              index: step.index,
              run,
              writer,
              db: step.db,
              targets: [...step.targets],
              carry: step.carry,
              cache: [...step.cache],
              messages: step.totals.messages,
              dbReads: step.totals.dbReads,
              staleReads: step.totals.staleReads,
            },
          });
        } else {
          await ctx.emit({
            type: 'read',
            payload: {
              round: step.round,
              reader: step.reader,
              value: step.value,
              db: step.db,
              refill: step.refill,
              stale: step.stale,
              cache: [...step.cache],
              messages: step.totals.messages,
              dbReads: step.totals.dbReads,
              staleReads: step.totals.staleReads,
            },
          });
        }
        show('messages', step.totals.messages);
        show('db-reads', step.totals.dbReads);
        show('stale-reads', step.totals.staleReads);
        if (!(await rctx.sleep(data.stepMs + data.motionMs))) return;
      }

      // 한 판이 끝났다 — 손잡이를 기다린다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'notify' && input.type !== 'run') continue;
        const value = knobValue(input.payload);
        if (value === null) continue;
        if (input.type === 'notify') {
          if (!data.notifies.includes(value)) continue;
          policy = value;
        } else {
          if (!data.runs.includes(value)) continue;
          run = value;
        }
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
