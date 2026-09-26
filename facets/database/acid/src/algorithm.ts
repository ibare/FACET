/**
 * ACID — 원자성과 지속성. 커밋에 OK 를 주는 때를 로그 내림 앞뒤로 옮기면 끊김 하나가 무엇을 지우는가.
 *
 * 한 판 = 처음 · 틱마다 하나(1..crashAfter) · 끊김 · 다시 켜기(로그 파일에 나타난 트랜잭션마다 하나, 첫 기록 차례).
 * 판을 끝까지 재생한 뒤 손잡이 입력을 기다리고, 받은 값으로 다시 재생한다 (reactive).
 *
 * ── 규약 (사양 그대로) ─────────────────────────────────────────────────────
 * - 사건 = 트랜잭션마다 쓰기 둘(보내는 줄 −액수, 받는 줄 +액수)과 커밋 하나, T1 부터 차례로.
 *   틱 = 사건 번호 1..12, LSN = 틱.
 * - 쓰기 = 로그 버퍼에 `<Tn, 줄, 옛 값, 새 값>` + 버퍼 풀 값 바꿈. 데이터 파일은 끊김 전에 건드리지 않는다
 *   (체크포인트 · 페이지 내보내기 없음). 커밋 = 로그 버퍼에 `<Tn, commit>`.
 * - 한 틱 안의 차례: 그 틱의 사건 → (커밋이면) 방식별 처리 → (주기면) 주기 내림 → (모아 내림이면) OK 풀기.
 *   - 0 `내린 뒤 OK`: 커밋 기록 → 로그 버퍼 **전부**를 로그 파일로 → 그 트랜잭션에 OK. 주기 내림 없음
 *   - 1 `모아 내림`: 커밋 기록만. 틱이 flushEvery 의 배수면 로그 버퍼 전부를 내리고, 커밋 기록이 로그 파일에
 *     든 트랜잭션 가운데 OK 를 아직 못 받은 것 모두에 OK
 *   - 2 `OK 먼저`: 커밋 기록 → 곧바로 OK. 틱이 flushEvery 의 배수면 로그 버퍼 전부를 내린다
 * - 끊김 = 틱 crashAfter 를 마친 뒤. 메모리(버퍼 풀 · 로그 버퍼)가 통째로 사라진다. 디스크(데이터 파일 · 로그 파일)는 남는다.
 * - 다시 켜기 = 로그 파일을 LSN 차례로 읽어, 로그 파일에 커밋 기록이 있는 트랜잭션의 쓰기만 새 값으로 데이터 파일에 쓴다.
 *   커밋 기록이 없는 트랜잭션은 쓰기 기록이 로그 파일에 있어도 건너뛴다.
 * - lost-oks = OK 를 받았는데 로그 파일에 커밋 기록이 없는 트랜잭션 수.
 *   반쪽(쓰기 둘 가운데 하나만 데이터 파일에 선 트랜잭션) 수는 verdict 의 half 로 셈해 싣는다 — 계기로는 보내지 않는다.
 * - 동률 규칙 — 없다. 견주는 수는 전부 정수 틱 · LSN 이고 같은 틱의 차례는 위 한 줄이 정한다.
 *
 * 셈 규칙은 irs.ts 의 `runCommits` 와 같다 — logged(로그 버퍼까지 붙은 끝 LSN) · flushed(로그 파일까지 내린 끝 LSN)
 * 두 정수와 okAt · committed 두 배열. 값(a..d)의 다시 하기만 IR 밖에서 이 파일이 한다.
 *
 * ── 이벤트 (payload) ──────────────────────────────────────────────────────
 * - `round`   { mode, crashAfter, ticks, rows: string[], start: number[], txNames: string[] }  — 걸음 0 (처음)
 * - `append`  { tick, lsn, tx, kind: 'write' | 'commit', row: number, before: number, after: number, pool: number[] }
 *             (commit 이면 row = -1 · before = after = 0)
 * - `flush`   { tick, upTo, moved, periodic: boolean }   — 로그 버퍼 전부(LSN ≤ upTo)가 로그 파일로. moved = 이번에 내린 기록 수
 * - `wait`    { tx, tick }   — 모아 내림에서 커밋 기록만 붙고 OK 를 기다린다
 * - `ok`      { tx, tick }   — 그 트랜잭션에 OK
 * - `crash`   { tick, logEnd, unanswered: number[] }   — 메모리가 사라진다. unanswered = 커밋했는데 OK 를 못 받은 트랜잭션
 * - `restart` { tx, redo: boolean, lsns: number[], data: number[] }   — 다시 켜기 한 걸음. data = 이 걸음 뒤 데이터 파일
 * - `verdict` { sent, lost: number[], half, redone, skipped, logEnd }   — 다시 켜기를 마친 걸음 (로그 파일이 비면 끊김 걸음)
 * - `phase`   { phase } — silent
 *
 * ── phase 어휘 (irs.ts 와 같다) ───────────────────────────────────────────
 * `append-write` · `append-commit` · `flush` · `send-ok` · `crash` · `redo` · `skip`
 *
 * ── 계기 ─────────────────────────────────────────────────────────────────
 * `log-flushes` (로그 내림 횟수, 내림 걸음) · `ok-sent` (OK 보낸 수, OK 걸음) ·
 * `lost-oks` (잃은 OK) — 다시 켜기를 마친 걸음에 정해진다.
 * 판을 새로 시작할 때 셋 다 0 으로 되돌린다 (차이 헬퍼 — 첫 판에도 0 을 보낸다).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type AcidTransfer = { from: number; to: number; amount: number };

export type AcidData = {
  type: 'acid';
  stepMs: number;
  /** 걸음 안 운동의 길이 (재생 속도 1 에서). 걸음 하나 = stepMs + motionMs */
  motionMs: number;
  rows: string[];
  start: number[];
  txNames: string[];
  transfers: AcidTransfer[];
  flushEvery: number;
  modeLadder: number[];
  crashLadder: number[];
  commitMode: number;
  crashAfter: number;
};

type MetricName = 'log-flushes' | 'ok-sent' | 'lost-oks';

/** 사건 차례 — 트랜잭션마다 쓰기 둘과 커밋 하나. 틱 = 색인 + 1. */
type AcidEvent = { tx: number; kind: 0 | 1; row: number; before: number; after: number };

function buildEvents(data: AcidData): AcidEvent[] {
  const rowCount = data.rows.length;
  if (data.start.length !== rowCount) throw new Error(`acid: start 길이 ${data.start.length} 가 줄 수 ${rowCount} 와 다르다`);
  if (data.txNames.length !== data.transfers.length) throw new Error('acid: txNames 와 transfers 의 길이가 다르다');
  const value = [...data.start];
  const events: AcidEvent[] = [];
  data.transfers.forEach((transfer, tx) => {
    for (const row of [transfer.from, transfer.to]) {
      if (!Number.isInteger(row) || row < 0 || row >= rowCount) throw new Error(`acid: 없는 줄 ${row}`);
    }
    const before0 = value[transfer.from];
    value[transfer.from] = before0 - transfer.amount;
    events.push({ tx, kind: 0, row: transfer.from, before: before0, after: value[transfer.from] });
    const before1 = value[transfer.to];
    value[transfer.to] = before1 + transfer.amount;
    events.push({ tx, kind: 0, row: transfer.to, before: before1, after: value[transfer.to] });
    events.push({ tx, kind: 1, row: -1, before: 0, after: 0 });
  });
  return events;
}

function readValue(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null || !('value' in payload)) return null;
  const v = (payload as { value: unknown }).value;
  return typeof v === 'number' ? v : null;
}

export async function acidAlgorithm(base: FacetContext<AcidData>): Promise<void> {
  const ctx = base as ReactiveContext<AcidData>;
  const data = ctx.data;
  const events = buildEvents(data);
  const txCount = data.transfers.length;
  const beat = data.stepMs + data.motionMs;

  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const shown: Record<MetricName, number> = { 'log-flushes': 0, 'ok-sent': 0, 'lost-oks': 0 };
  const setMetric = (name: MetricName, value: number) => {
    ctx.metric(name, value - shown[name]);
    shown[name] = value;
  };

  let mode = data.commitMode;
  let crashAfter = data.crashAfter;

  /** 한 판. 취소되면 false. */
  const playRound = async (): Promise<boolean> => {
    if (mode !== 0 && mode !== 1 && mode !== 2) throw new Error(`acid: 모르는 커밋 방식 ${mode}`);
    if (!Number.isInteger(crashAfter) || crashAfter < 1 || crashAfter > events.length) {
      throw new Error(`acid: 끊는 틱 ${crashAfter} 가 사건 1..${events.length} 밖이다`);
    }
    await ctx.emit({
      type: 'round',
      payload: { mode, crashAfter, ticks: events.length, rows: [...data.rows], start: [...data.start], txNames: [...data.txNames] },
    });
    setMetric('log-flushes', 0);
    setMetric('ok-sent', 0);
    setMetric('lost-oks', 0);
    if (!(await ctx.sleep(beat))) return false;

    let logged = 0;
    let flushed = 0;
    let flushes = 0;
    let sent = 0;
    const okAt: number[] = new Array<number>(txCount).fill(0);
    const committed: number[] = new Array<number>(txCount).fill(0);
    const pool = [...data.start];

    const flushAll = async (tick: number, periodic: boolean) => {
      const moved = logged - flushed;
      flushed = logged;
      flushes += 1;
      await ctx.emit({ type: 'flush', payload: { tick, upTo: flushed, moved, periodic } });
      setMetric('log-flushes', flushes);
      await phase('flush');
    };
    const sendOk = async (tx: number, tick: number) => {
      okAt[tx] = tick;
      sent += 1;
      await ctx.emit({ type: 'ok', payload: { tx, tick } });
      setMetric('ok-sent', sent);
      await phase('send-ok');
    };

    for (let tick = 1; tick <= crashAfter; tick += 1) {
      if (ctx.cancelled) return false;
      const e = tick - 1;
      const ev = events[e];
      logged = logged + 1;
      if (ev.kind === 0) {
        pool[ev.row] = ev.after;
        await ctx.emit({
          type: 'append',
          payload: { tick, lsn: logged, tx: ev.tx, kind: 'write', row: ev.row, before: ev.before, after: ev.after, pool: [...pool] },
        });
        await phase('append-write');
      } else {
        await ctx.emit({
          type: 'append',
          payload: { tick, lsn: logged, tx: ev.tx, kind: 'commit', row: -1, before: 0, after: 0, pool: [...pool] },
        });
        await phase('append-commit');
        if (mode === 0) {
          await flushAll(tick, false);
          await sendOk(ev.tx, tick);
        }
        if (mode === 1) {
          await ctx.emit({ type: 'wait', payload: { tx: ev.tx, tick } });
        }
        if (mode === 2) {
          await sendOk(ev.tx, tick);
        }
      }
      if (mode !== 0 && tick % data.flushEvery === 0) {
        await flushAll(tick, true);
        if (mode === 1) {
          for (let j = 0; j < flushed; j += 1) {
            if (ctx.cancelled) return false;
            if (events[j].kind === 1 && okAt[events[j].tx] === 0) {
              await sendOk(events[j].tx, tick);
            }
          }
        }
      }
      if (!(await ctx.sleep(beat))) return false;
    }

    // 끊김 — 로그 버퍼가 사라진다
    if (ctx.cancelled) return false;
    logged = flushed;
    const unanswered: number[] = [];
    for (let j = 0; j < crashAfter; j += 1) {
      if (events[j].kind === 1 && okAt[events[j].tx] === 0) unanswered.push(events[j].tx);
    }
    await ctx.emit({ type: 'crash', payload: { tick: crashAfter, logEnd: flushed, unanswered } });
    await phase('crash');

    // 로그 파일의 커밋 기록 훑기
    for (let j = 0; j < flushed; j += 1) {
      if (events[j].kind === 1) committed[events[j].tx] = 1;
    }
    // 로그 파일에 나타난 트랜잭션 — 첫 기록 차례
    const inLog: number[] = [];
    for (let j = 0; j < flushed; j += 1) {
      if (!inLog.includes(events[j].tx)) inLog.push(events[j].tx);
    }

    const dataFile = [...data.start];
    const appliedWrites: number[] = new Array<number>(txCount).fill(0);
    let redone = 0;
    let skipped = 0;
    const finish = async () => {
      const lost: number[] = [];
      for (let k = 0; k < txCount; k += 1) {
        if (okAt[k] > 0 && committed[k] === 0) lost.push(k);
      }
      let half = 0;
      for (let k = 0; k < txCount; k += 1) {
        if (appliedWrites[k] !== 0 && appliedWrites[k] !== 2) half += 1;
      }
      await ctx.emit({ type: 'verdict', payload: { sent, lost, half, redone, skipped, logEnd: flushed } });
      setMetric('lost-oks', lost.length);
    };

    if (inLog.length === 0) {
      await finish();
      return true;
    }
    if (!(await ctx.sleep(beat))) return false;

    for (let s = 0; s < inLog.length; s += 1) {
      if (ctx.cancelled) return false;
      const tx = inLog[s];
      const lsns: number[] = [];
      for (let j = 0; j < flushed; j += 1) {
        if (events[j].tx === tx) lsns.push(j + 1);
      }
      const redo = committed[tx] === 1;
      if (redo) {
        for (const lsn of lsns) {
          const ev = events[lsn - 1];
          if (ev.kind === 0) {
            dataFile[ev.row] = ev.after;
            appliedWrites[tx] += 1;
          }
        }
        redone += 1;
      } else {
        skipped += 1;
      }
      await ctx.emit({ type: 'restart', payload: { tx, redo, lsns, data: [...dataFile] } });
      if (redo) await phase('redo');
      else await phase('skip');
      if (s === inLog.length - 1) {
        await finish();
        return true;
      }
      if (!(await ctx.sleep(beat))) return false;
    }
    throw new Error('acid: 다시 켜기가 끝을 맺지 못했다');
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound())) return;
      // 손잡이 입력을 기다린다 — 우리 것이 아닌 입력 · 사다리 밖 값은 흘린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const v = readValue(input.payload);
        if (v === null) continue;
        if (input.type === 'commitMode' && data.modeLadder.includes(v)) {
          mode = v;
          break;
        }
        if (input.type === 'crashAfter' && data.crashLadder.includes(v)) {
          crashAfter = v;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
