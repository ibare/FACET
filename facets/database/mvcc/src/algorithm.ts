/**
 * mvcc — 오래 연 스냅샷이 옛 판을 붙잡는다.
 *
 * 줄 `price` 하나에 저절로 커밋되는 쓰기 넷이 판을 쌓고, 읽는 이 `TR` 이 두 번 읽고, 틱 12 에 청소가 돈다.
 * 손잡이 둘 — 스냅샷을 잡는 때(트랜잭션 시작 · 문장마다)와 읽는 이의 시작 틱. 한 판을 끝까지 재생하고
 * 입력을 기다렸다가 받은 값으로 처음부터 다시 재생한다.
 *
 * 규약 (사양 그대로):
 *   - 판 = (값, 시작 틱, 끝 틱). 끝 없음이 지금 판이고 버퍼에서는 끝 틱 `0` 으로 적는다 (틱은 1 부터).
 *   - 커밋 틱 t = 새 판 시작 t · 앞 지금 판 끝 t.
 *   - 보임 규칙: 시작 틱 ≤ 스냅샷 < 끝 틱 (끝 없음 = 무한). 보이는 판이 하나가 아니면 던진다.
 *   - 스냅샷 — 트랜잭션 시작(0): 두 읽기 모두 시작 틱. 문장마다(1): 읽기마다 그 읽기의 틱.
 *   - 청소 — 열린 트랜잭션이 쥔 스냅샷 가운데 가장 이른 것을 본다. 남기는 판 = 지금 판 + 끝 틱이 그 스냅샷보다
 *     큰 판. 쥔 스냅샷이 없으면(문장마다 — 문장 사이에는 스냅샷이 없다) 지금 판만 남긴다 (`oldest = 0`).
 *     남은 판은 차례를 지켜 앞으로 당긴다.
 *   - 틱은 사건마다 하나. 같은 틱에 사건 둘은 없다 — 있으면 던진다.
 *   - 셈은 irs.ts 의 readVersion · commitVersion · vacuum 과 같은 규칙이다 (버퍼 셋 · 판 수).
 *   - 동률 규칙은 없다 — 보이는 판은 하나여야 하고, 둘 이상이면 던진다.
 *
 * 이벤트 (silent 가 아니면 걸음 하나. 걸음 경계는 이벤트 뒤의 sleep):
 *   - `round-start` { mode: 0|1, begin: number, row: string, reader: string,
 *                     versions: Version[], tick: number }                      — 처음 모습 (걸음 0)
 *   - `commit`      { tick, tx: string, value, versions: Version[], count }      — 새 판이 붙는다
 *   - `read`        { tick, which: 1|2, snap, index, value, start, count, held: boolean }
 *                    index 는 보이는 판의 버퍼 자리(0 부터), held 는 읽은 뒤에도 스냅샷을 쥐고 있는가
 *   - `vacuum`      { tick, oldest: number (0 = 쥔 스냅샷 없음), kept: boolean[] (청소 앞 판마다),
 *                     versions: Version[], count, freed }
 *   - `phase`       { phase: 'read' | 'commit' | 'vacuum' } — silent
 *   Version = { value: number, start: number, end: number (0 = 끝 없음) }
 *
 * phase 어휘: `read` · `commit` · `vacuum` (irs.ts 와 같다). 처음 걸음은 phase 없음.
 *
 * 계기: `first-read` · `second-read` (그 읽기 걸음에 읽은 값) · `version-count` (처음 1, 커밋 · 청소 걸음마다 지금 판 수) ·
 *       `freed-versions` (청소 걸음에 걷힌 판 수). 판을 새로 시작할 때 0 · 1 로 되돌린다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type MvccWrite = { tx: string; tick: number; value: number };

export type MvccData = {
  type: 'mvcc';
  stepMs: number;
  row: string;
  reader: string;
  startValue: number;
  startTick: number;
  writes: MvccWrite[];
  secondReadTick: number;
  vacuumTick: number;
  modeLadder: number[];
  beginLadder: number[];
  snapshot: number;
  readerBegin: number;
};

export type MvccVersion = { value: number; start: number; end: number };

/** 버퍼 셋 — IR 이 받는 모양 그대로. 길이는 처음 판 + 쓰기 수. */
export type MvccBuffers = { values: number[]; starts: number[]; ends: number[] };

/** IR readVersion 과 같은 셈 — 보이는 판의 자리, 하나가 아니면 -1. */
export function readVersion(starts: number[], ends: number[], count: number, snap: number): number {
  let found = -1;
  let seen = 0;
  for (let i = 0; i < count; i++) {
    if (starts[i] <= snap && (ends[i] === 0 || snap < ends[i])) {
      found = i;
      seen = seen + 1;
    }
  }
  if (seen !== 1) return -1;
  return found;
}

/** IR commitVersion 과 같은 셈 — 지금 판에 끝 틱을 찍고 새 판을 붙인다. 새 판 수. */
export function commitVersion(
  values: number[],
  starts: number[],
  ends: number[],
  count: number,
  value: number,
  tick: number,
): number {
  ends[count - 1] = tick;
  values[count] = value;
  starts[count] = tick;
  ends[count] = 0;
  return count + 1;
}

/** IR vacuum 과 같은 셈 — 남길 판을 앞으로 당겨 채운다. 남은 판 수. */
export function vacuum(
  values: number[],
  starts: number[],
  ends: number[],
  count: number,
  oldest: number,
): number {
  let kept = 0;
  for (let i = 0; i < count; i++) {
    if (ends[i] === 0 || (oldest > 0 && oldest < ends[i])) {
      values[kept] = values[i];
      starts[kept] = starts[i];
      ends[kept] = ends[i];
      kept = kept + 1;
    }
  }
  return kept;
}

type MvccEvent =
  | { tick: number; kind: 'read'; which: 1 | 2 }
  | { tick: number; kind: 'commit'; tx: string; value: number }
  | { tick: number; kind: 'vacuum' };

/** 한 판의 사건 차례 — 틱 차례. 같은 틱에 사건 둘이면 던진다. */
export function mvccEvents(data: MvccData, begin: number): MvccEvent[] {
  const events: MvccEvent[] = [
    { tick: begin, kind: 'read', which: 1 },
    ...data.writes.map((w): MvccEvent => ({ tick: w.tick, kind: 'commit', tx: w.tx, value: w.value })),
    { tick: data.secondReadTick, kind: 'read', which: 2 },
    { tick: data.vacuumTick, kind: 'vacuum' },
  ];
  events.sort((a, b) => a.tick - b.tick);
  for (let i = 1; i < events.length; i++) {
    if (events[i].tick === events[i - 1].tick) {
      throw new Error(`[mvcc] 틱 ${events[i].tick} 에 사건이 둘이다`);
    }
  }
  if (events[0].tick <= data.startTick) {
    throw new Error(`[mvcc] 첫 사건 틱 ${events[0].tick} 이 처음 판 시작 틱 ${data.startTick} 보다 늦지 않다`);
  }
  return events;
}

/** 처음 판 하나가 든 버퍼. */
export function mvccBuffers(data: MvccData): MvccBuffers {
  const cap = 1 + data.writes.length;
  const values = new Array<number>(cap).fill(0);
  const starts = new Array<number>(cap).fill(0);
  const ends = new Array<number>(cap).fill(0);
  values[0] = data.startValue;
  starts[0] = data.startTick;
  ends[0] = 0;
  return { values, starts, ends };
}

function chain(buf: MvccBuffers, count: number): MvccVersion[] {
  const out: MvccVersion[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ value: buf.values[i], start: buf.starts[i], end: buf.ends[i] });
  }
  return out;
}

/** 한 판의 결과 — 검사와 대조용. 알고리즘이 화면에 내는 값과 같은 셈이다. */
export type MvccOutcome = {
  reads: number[];
  readIndex: number[];
  countsAfterEvent: number[];
  kept: number;
  freed: number;
  finalChain: MvccVersion[];
  buffers: MvccBuffers;
  steps: number;
};

export function mvccOutcome(data: MvccData, mode: number, begin: number): MvccOutcome {
  const buf = mvccBuffers(data);
  let count = 1;
  const reads: number[] = [];
  const readIndex: number[] = [];
  const countsAfterEvent: number[] = [];
  let kept = -1;
  let freed = -1;
  for (const e of mvccEvents(data, begin)) {
    if (e.kind === 'commit') {
      count = commitVersion(buf.values, buf.starts, buf.ends, count, e.value, e.tick);
    } else if (e.kind === 'read') {
      const snap = mode === 0 || e.which === 1 ? begin : e.tick;
      const idx = readVersion(buf.starts, buf.ends, count, snap);
      if (idx < 0) throw new Error(`[mvcc] 스냅샷 ${snap} 에 보이는 판이 하나가 아니다`);
      reads.push(buf.values[idx]);
      readIndex.push(idx);
    } else {
      const oldest = mode === 0 ? begin : 0;
      const before = count;
      count = vacuum(buf.values, buf.starts, buf.ends, count, oldest);
      kept = count;
      freed = before - count;
    }
    countsAfterEvent.push(count);
  }
  if (kept < 0) throw new Error('[mvcc] 청소가 없는 판이다');
  return {
    reads,
    readIndex,
    countsAfterEvent,
    kept,
    freed,
    finalChain: chain(buf, count),
    buffers: buf,
    steps: 1 + countsAfterEvent.length,
  };
}

type MetricName = 'first-read' | 'second-read' | 'version-count' | 'freed-versions';

export async function mvccAlgorithm(ctx0: FacetContext<MvccData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<MvccData>;
  const data = ctx.data;
  if (!data.modeLadder.includes(data.snapshot)) throw new Error(`[mvcc] 스냅샷 기본값 ${data.snapshot} 이 사다리에 없다`);
  if (!data.beginLadder.includes(data.readerBegin)) {
    throw new Error(`[mvcc] 시작 틱 기본값 ${data.readerBegin} 이 사다리에 없다`);
  }

  // 계기는 누적 채널이다 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 차이가 0 이어도 보낸다.
  const shown: Record<MetricName, number> = {
    'first-read': 0,
    'second-read': 0,
    'version-count': 0,
    'freed-versions': 0,
  };
  const sent = new Set<MetricName>();
  const setMetric = (name: MetricName, value: number): void => {
    const delta = value - shown[name];
    if (delta !== 0 || !sent.has(name)) ctx.metric(name, delta);
    shown[name] = value;
    sent.add(name);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const pause = () => ctx.sleep(data.stepMs);

  const playRound = async (mode: number, begin: number): Promise<boolean> => {
    const buf = mvccBuffers(data);
    let count = 1;
    const events = mvccEvents(data, begin);

    setMetric('first-read', 0);
    setMetric('second-read', 0);
    setMetric('version-count', count);
    setMetric('freed-versions', 0);
    await ctx.emit({
      type: 'round-start',
      payload: {
        mode,
        begin,
        row: data.row,
        reader: data.reader,
        versions: chain(buf, count),
        tick: data.startTick,
      },
    });
    if (!(await pause())) return false;

    for (const e of events) {
      if (ctx.cancelled) return false;
      if (e.kind === 'commit') {
        count = commitVersion(buf.values, buf.starts, buf.ends, count, e.value, e.tick);
        setMetric('version-count', count);
        await phase('commit');
        await ctx.emit({
          type: 'commit',
          payload: { tick: e.tick, tx: e.tx, value: e.value, versions: chain(buf, count), count },
        });
      } else if (e.kind === 'read') {
        const snap = mode === 0 || e.which === 1 ? begin : e.tick;
        const idx = readVersion(buf.starts, buf.ends, count, snap);
        if (idx < 0) throw new Error(`[mvcc] 스냅샷 ${snap} 에 보이는 판이 하나가 아니다`);
        const value = buf.values[idx];
        if (e.which === 1) setMetric('first-read', value);
        else setMetric('second-read', value);
        await phase('read');
        await ctx.emit({
          type: 'read',
          payload: {
            tick: e.tick,
            which: e.which,
            snap,
            index: idx,
            value,
            start: buf.starts[idx],
            count,
            // 트랜잭션 시작이면 읽는 이가 끝까지 스냅샷을 쥔다. 문장마다면 문장이 끝나며 놓는다.
            held: mode === 0,
          },
        });
      } else {
        const oldest = mode === 0 ? begin : 0;
        const before = count;
        const keptFlags: boolean[] = [];
        for (let i = 0; i < before; i++) {
          keptFlags.push(buf.ends[i] === 0 || (oldest > 0 && oldest < buf.ends[i]));
        }
        count = vacuum(buf.values, buf.starts, buf.ends, count, oldest);
        if (keptFlags.filter(Boolean).length !== count) throw new Error('[mvcc] 청소의 남은 판 수가 어긋난다');
        setMetric('version-count', count);
        setMetric('freed-versions', before - count);
        await phase('vacuum');
        await ctx.emit({
          type: 'vacuum',
          payload: { tick: e.tick, oldest, kept: keptFlags, versions: chain(buf, count), count, freed: before - count },
        });
      }
      if (!(await pause())) return false;
    }
    return true;
  };

  let mode = data.snapshot;
  let begin = data.readerBegin;
  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound(mode, begin))) return;
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const payload = input.payload;
        if (typeof payload !== 'object' || payload === null) continue;
        const value = (payload as { value?: unknown }).value;
        if (typeof value !== 'number') continue;
        if (input.type === 'snapshot' && data.modeLadder.includes(value)) {
          mode = value;
          break;
        }
        if (input.type === 'readerBegin' && data.beginLadder.includes(value)) {
          begin = value;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
