/**
 * defer-vs-async 조각의 알고리즘.
 *
 * 문서(스크립트 두 줄 + 본문 줄)를 `defer`/`async` 두 속성으로 각각 파싱-실행 모형에
 * 돌려 두 쪽의 사건 시각을 셈하고, 두 쪽을 합친 걸음마다 하나씩 이벤트를 낸다.
 *
 * 이벤트
 * - `moment` — payload: `{ ms: number; entries: DeferVsAsyncMomentEntry[] }`.
 *   `entries` 는 그 ms 에 두 쪽 가운데 일어난 사건들 — `{ side: 'defer' | 'async';
 *   kind: 'request' | 'arrive' | 'exec-start' | 'exec-end' | 'parse-end' | 'dcl';
 *   script?: 'big' | 'small' }`. silent 아님 — 화면이 걸음마다 새로 드러난 사건을 그린다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DeferVsAsyncScriptId = 'big' | 'small';

export type DeferVsAsyncScript = {
  id: DeferVsAsyncScriptId;
  /** 파일 이름 — 번역하지 않는 자료 */
  src: string;
  /** 받기(ms) */
  dur: number;
  /** 실행(ms) */
  exec: number;
};

export type DeferVsAsyncFacetData = {
  type: 'defer-vs-async';
  /** 한 줄을 읽는 데 걸리는 ms */
  parseMs: number;
  /** 문서 순서: [big, small] */
  scripts: [DeferVsAsyncScript, DeferVsAsyncScript];
  /** 스크립트 두 줄 뒤에 오는 본문 줄 수 */
  bodyLineCount: number;
  stepMs: number;
};

export type DeferVsAsyncSide = 'defer' | 'async';

export type DeferVsAsyncMomentKind =
  | 'request'
  | 'arrive'
  | 'exec-start'
  | 'exec-end'
  | 'parse-end'
  | 'dcl';

export type DeferVsAsyncMomentEntry = {
  side: DeferVsAsyncSide;
  kind: DeferVsAsyncMomentKind;
  script?: DeferVsAsyncScriptId;
};

export type DeferVsAsyncMomentPayload = {
  ms: number;
  entries: DeferVsAsyncMomentEntry[];
};

type RawEvent = {
  ms: number;
  kind: DeferVsAsyncMomentKind;
  script?: DeferVsAsyncScriptId;
};

type ScriptTimes = Record<DeferVsAsyncScriptId, number>;

/** 한 쪽(defer 또는 async)의 사건을 시각 차례로 쌓는다. */
function simulateSide(
  data: DeferVsAsyncFacetData,
  side: DeferVsAsyncSide,
): RawEvent[] {
  const { parseMs, scripts, bodyLineCount } = data;
  if (scripts.length !== 2) {
    throw new Error(`defer-vs-async: 스크립트가 둘이 아니다 (${scripts.length})`);
  }
  const [big, small] = scripts;
  if (big.id !== 'big' || small.id !== 'small') {
    throw new Error(
      `defer-vs-async: 스크립트 차례가 예상과 다르다 (${big.id}, ${small.id})`,
    );
  }
  if (!Number.isInteger(parseMs) || parseMs <= 0) {
    throw new Error(`defer-vs-async: parseMs 가 올바르지 않다 (${parseMs})`);
  }
  if (!Number.isInteger(bodyLineCount) || bodyLineCount <= 0) {
    throw new Error(
      `defer-vs-async: bodyLineCount 가 올바르지 않다 (${bodyLineCount})`,
    );
  }
  for (const s of [big, small]) {
    if (
      !Number.isInteger(s.dur) ||
      s.dur <= 0 ||
      !Number.isInteger(s.exec) ||
      s.exec <= 0
    ) {
      throw new Error(`defer-vs-async: ${s.id} 의 받기·실행 시간이 올바르지 않다`);
    }
  }

  const arriveAt = {} as ScriptTimes;
  const durOf = { big: big.dur, small: small.dur } as ScriptTimes;
  const execOf = { big: big.exec, small: small.exec } as ScriptTimes;
  const execStart: Partial<ScriptTimes> = {};
  const execEnd: Partial<ScriptTimes> = {};

  const asyncPending = new Set<DeferVsAsyncScriptId>();
  const deferQueue: DeferVsAsyncScriptId[] = [];
  const log: RawEvent[] = [];

  function boundary(from: number): number {
    let ms = from;
    for (;;) {
      const ready = [...asyncPending]
        .filter((id) => arriveAt[id] <= ms)
        .sort((a, b) => arriveAt[a] - arriveAt[b]);
      const next = ready[0];
      if (next === undefined) return ms;
      asyncPending.delete(next);
      execStart[next] = ms;
      log.push({ ms, kind: 'exec-start', script: next });
      ms += execOf[next];
      execEnd[next] = ms;
      log.push({ ms, kind: 'exec-end', script: next });
    }
  }

  let ms = 0;
  for (const s of [big, small] as const) {
    ms += parseMs;
    arriveAt[s.id] = ms + durOf[s.id];
    log.push({ ms, kind: 'request', script: s.id });
    if (side === 'async') asyncPending.add(s.id);
    else deferQueue.push(s.id);
    ms = boundary(ms);
  }
  for (let i = 0; i < bodyLineCount; i += 1) {
    ms += parseMs;
    ms = boundary(ms);
  }
  const parseEnd = ms;
  log.push({ ms: parseEnd, kind: 'parse-end' });

  for (const id of deferQueue) {
    ms = Math.max(ms, arriveAt[id]);
    ms = boundary(ms);
    execStart[id] = ms;
    log.push({ ms, kind: 'exec-start', script: id });
    ms += execOf[id];
    execEnd[id] = ms;
    log.push({ ms, kind: 'exec-end', script: id });
  }
  log.push({ ms, kind: 'dcl' });

  while (asyncPending.size > 0) {
    const ready = [...asyncPending].sort((a, b) => arriveAt[a] - arriveAt[b]);
    const id = ready[0]!;
    asyncPending.delete(id);
    ms = Math.max(ms, arriveAt[id]);
    execStart[id] = ms;
    log.push({ ms, kind: 'exec-start', script: id });
    ms += execOf[id];
    execEnd[id] = ms;
    log.push({ ms, kind: 'exec-end', script: id });
  }

  if (
    execStart.big === undefined ||
    execEnd.big === undefined ||
    execStart.small === undefined ||
    execEnd.small === undefined
  ) {
    throw new Error('defer-vs-async: 실행 시각을 셈하지 못했다');
  }

  const arriveLog: RawEvent[] = [
    { ms: arriveAt.big, kind: 'arrive', script: 'big' },
    { ms: arriveAt.small, kind: 'arrive', script: 'small' },
  ];
  return [...arriveLog, ...log].sort((a, b) => a.ms - b.ms);
}

/** 두 쪽의 사건 차례를 ms 로 합쳐 걸음(moment) 목록을 만든다. */
function buildMoments(
  deferLog: RawEvent[],
  asyncLog: RawEvent[],
): DeferVsAsyncMomentPayload[] {
  const bucket = new Map<number, DeferVsAsyncMomentEntry[]>();
  function addSide(side: DeferVsAsyncSide, log: RawEvent[]): void {
    for (const e of log) {
      const list = bucket.get(e.ms) ?? [];
      list.push({ side, kind: e.kind, script: e.script });
      bucket.set(e.ms, list);
    }
  }
  addSide('defer', deferLog);
  addSide('async', asyncLog);
  return [...bucket.keys()]
    .sort((a, b) => a - b)
    .map((eventMs) => ({ ms: eventMs, entries: bucket.get(eventMs)! }));
}

export async function deferVsAsync(
  ctx: FacetContext<DeferVsAsyncFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<DeferVsAsyncFacetData>;
  const data = rctx.data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(data.stepMs)) && !rctx.cancelled;
  }

  const deferLog = simulateSide(data, 'defer');
  const asyncLog = simulateSide(data, 'async');
  const moments = buildMoments(deferLog, asyncLog);

  for (const moment of moments) {
    if (!(await pause())) return;
    await rctx.emit({ type: 'moment', payload: moment });
  }
}
