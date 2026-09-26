/**
 * acid projector — 알고리즘 이벤트를 무대 메서드와 캡션으로 옮긴다.
 *
 * 셈하지 않는다. OK 틱 · 내린 기록 수 · 잃은 OK · 데이터 파일 값은 payload 에서 읽는다.
 * 운동 길이는 부를 때마다 `runtime.getSpeed()` 를 읽어 재생 속도를 따라가게 한다.
 */
import { makeTranslator, type ProjectorFactory, type Translate } from '@ffacet/core/runtime';
import type { AcidAppend, AcidStage } from './acid-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };
type Payload = Record<string, unknown>;

function asPayload(p: unknown, type: string): Payload {
  if (typeof p !== 'object' || p === null) throw new Error(`acid projector: ${type} payload 가 없다`);
  return p as Payload;
}
function num(p: Payload, key: string): number {
  const val = p[key];
  if (typeof val !== 'number') throw new Error(`acid projector: ${key} 가 수가 아니다`);
  return val;
}
function nums(p: Payload, key: string): number[] {
  const val = p[key];
  if (!Array.isArray(val) || !val.every((x) => typeof x === 'number')) throw new Error(`acid projector: ${key} 가 수 목록이 아니다`);
  return val as number[];
}
function strs(p: Payload, key: string): string[] {
  const val = p[key];
  if (!Array.isArray(val) || !val.every((x) => typeof x === 'string')) throw new Error(`acid projector: ${key} 가 글 목록이 아니다`);
  return val as string[];
}
function bool(p: Payload, key: string): boolean {
  const val = p[key];
  if (typeof val !== 'boolean') throw new Error(`acid projector: ${key} 가 참거짓이 아니다`);
  return val;
}

function modeName(t: Translate, mode: number): string {
  if (mode === 0) return t('label.mode0', 'Flush, then OK');
  if (mode === 1) return t('label.mode1', 'Group flush');
  if (mode === 2) return t('label.mode2', 'OK first');
  throw new Error(`acid projector: 모르는 커밋 방식 ${mode}`);
}

export const acidProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as AcidStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();

  let motionMs: number | null = null;
  const dur = (): number => {
    if (motionMs === null) throw new Error('acid projector: onInit 전에 이벤트를 받았다');
    const speed = runtime?.getSpeed() ?? 1;
    return Math.round(motionMs / Math.max(speed, 0.01));
  };

  let mode = -1;
  let rows: string[] = [];
  let txNames: string[] = [];
  let line1 = '';
  let line2 = '';
  let flushMoved = 0;
  let released = 0;
  const show = () => stage?.setCaption(line1, line2);
  const txName = (tx: number): string => {
    const name = txNames[tx];
    if (name === undefined) throw new Error(`acid projector: 없는 트랜잭션 ${tx}`);
    return name;
  };
  const rowName = (row: number): string => {
    const name = rows[row];
    if (name === undefined) throw new Error(`acid projector: 없는 줄 ${row}`);
    return name;
  };

  return {
    onInit(data) {
      const p = asPayload(data, 'initialData');
      motionMs = num(p, 'motionMs');
    },
    onEvent(e) {
      switch (e.type) {
        case 'phase': {
          const p = asPayload(e.payload, 'phase');
          const ph = p.phase;
          if (typeof ph !== 'string') throw new Error('acid projector: phase 가 글이 아니다');
          code?.highlightPhase?.(ph);
          return;
        }
        case 'round': {
          const p = asPayload(e.payload, 'round');
          mode = num(p, 'mode');
          rows = strs(p, 'rows');
          txNames = strs(p, 'txNames');
          const crashAfter = num(p, 'crashAfter');
          stage?.reset({ crashAfter, ticks: num(p, 'ticks'), rows, start: nums(p, 'start'), txNames }, dur());
          code?.clearHighlight?.();
          line1 = t('caption.start', 'Commit mode: {mode} · crash after tick {tick}', { mode: modeName(t, mode), tick: crashAfter });
          line2 = '';
          show();
          return;
        }
        case 'append': {
          const p = asPayload(e.payload, 'append');
          const kind = p.kind;
          if (kind !== 'write' && kind !== 'commit') throw new Error('acid projector: 모르는 기록 종류');
          const rec: AcidAppend = {
            tick: num(p, 'tick'),
            lsn: num(p, 'lsn'),
            tx: num(p, 'tx'),
            kind,
            row: num(p, 'row'),
            before: num(p, 'before'),
            after: num(p, 'after'),
            pool: nums(p, 'pool'),
          };
          stage?.append(rec, dur());
          flushMoved = 0;
          released = 0;
          line2 = '';
          if (kind === 'write') {
            const record = `<${txName(rec.tx)}, ${rowName(rec.row)}, ${rec.before}, ${rec.after}>`;
            line1 = t('caption.write', 'Tick {tick} · write {record}', { tick: rec.tick, record });
          } else {
            const record = `<${txName(rec.tx)}, commit>`;
            if (mode === 0) {
              line1 = t('caption.commitFlushOk', 'Tick {tick} · {record} — flush the log buffer, then OK', { tick: rec.tick, record });
            } else if (mode === 1) {
              line1 = t('caption.commitWait', 'Tick {tick} · {record} — the OK waits for the next flush', { tick: rec.tick, record });
            } else {
              line1 = t('caption.commitOkFirst', 'Tick {tick} · {record} — OK before any flush', { tick: rec.tick, record });
            }
          }
          show();
          return;
        }
        case 'flush': {
          const p = asPayload(e.payload, 'flush');
          stage?.flush(num(p, 'upTo'), dur());
          flushMoved = num(p, 'moved');
          line2 = bool(p, 'periodic')
            ? t('caption.flushPeriodic', 'Periodic flush — records moved to the log file: {n}', { n: flushMoved })
            : t('caption.flushNow', 'Records moved to the log file: {n}', { n: flushMoved });
          show();
          return;
        }
        case 'wait': {
          const p = asPayload(e.payload, 'wait');
          stage?.markWait(num(p, 'tx'), num(p, 'tick'), dur());
          return;
        }
        case 'ok': {
          const p = asPayload(e.payload, 'ok');
          stage?.markOk(num(p, 'tx'), num(p, 'tick'), dur());
          if (mode === 1) {
            released += 1;
            line2 = t('caption.flushOk', 'Periodic flush — records moved to the log file: {n} · OKs sent: {k}', {
              n: flushMoved,
              k: released,
            });
            show();
          }
          return;
        }
        case 'crash': {
          const p = asPayload(e.payload, 'crash');
          const unanswered = nums(p, 'unanswered');
          stage?.crash(num(p, 'tick'), unanswered, dur());
          line1 = t('caption.crash', 'Crash after tick {tick} — the buffer pool and the log buffer are gone', { tick: num(p, 'tick') });
          line2 = t('caption.crashLine', 'Records in the log file: {n} · commits waiting for an OK: {w}', {
            n: num(p, 'logEnd'),
            w: unanswered.length,
          });
          show();
          return;
        }
        case 'restart': {
          const p = asPayload(e.payload, 'restart');
          const tx = num(p, 'tx');
          const redo = bool(p, 'redo');
          stage?.restart(tx, redo, nums(p, 'lsns'), nums(p, 'data'), dur());
          line1 = redo
            ? t('caption.redo', 'Restart · {tx}: commit record in the log file — redo', { tx: txName(tx) })
            : t('caption.skip', 'Restart · {tx}: no commit record in the log file — skip', { tx: txName(tx) });
          line2 = '';
          show();
          return;
        }
        case 'verdict': {
          const p = asPayload(e.payload, 'verdict');
          const lost = nums(p, 'lost');
          stage?.verdict(lost, dur());
          line2 = t('caption.verdict', 'OKs sent: {sent} · lost OKs: {lost} · records in the log file: {n}', {
            sent: num(p, 'sent'),
            lost: lost.length,
            n: num(p, 'logEnd'),
          });
          show();
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      code?.clearHighlight?.();
    },
  };
};
