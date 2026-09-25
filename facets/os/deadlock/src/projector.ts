/**
 * deadlock projector — `round` · `chunk` · `result` 를 stage 의 장면 옮기기로 번역한다.
 *
 * 셈하지 않는다. payload 를 typeof 로 좁혀 stage 에 넘기고, 캡션 문안을 짓는다.
 * 운동 길이는 부를 때마다 재생 속도를 읽어 셈한다 (1 배속 300ms).
 */
import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';
import type { ChunkView, DeadlockStage, RoundView, StageArrow, StageCell, ThreadState } from './deadlock-stage.js';

const MOTION_MS = 300;

type Obj = Record<string, unknown>;

function obj(v: unknown, what: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`${what} 가 객체가 아니다`);
  return v as Obj;
}
function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${what} 가 수가 아니다`);
  return v;
}
function bool(v: unknown, what: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`${what} 가 참거짓이 아니다`);
  return v;
}
function list(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`${what} 가 배열이 아니다`);
  return v;
}
function strs(v: unknown, what: string): string[] {
  return list(v, what).map((x, i) => {
    if (typeof x !== 'string') throw new Error(`${what}[${i}] 가 글자가 아니다`);
    return x;
  });
}
function nums(v: unknown, what: string): number[] {
  return list(v, what).map((x, i) => num(x, `${what}[${i}]`));
}
function stateOf(v: unknown, what: string): ThreadState {
  if (v === 'running' || v === 'ready' || v === 'asleep' || v === 'done') return v;
  throw new Error(`${what} 가 모르는 상태다: ${String(v)}`);
}
function arrowsOf(v: unknown): StageArrow[] {
  return list(v, 'arrows').map((a, i) => {
    const o = obj(a, `arrows[${i}]`);
    return { from: num(o.from, 'arrow.from'), to: num(o.to, 'arrow.to'), lock: num(o.lock, 'arrow.lock') };
  });
}

export const deadlockProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as DeadlockStage | undefined;
  const t = runtime?.t ?? makeTranslator();
  const motion = (): number => MOTION_MS / Math.max(0.01, runtime?.getSpeed() ?? 1);
  let threads: string[] = [];
  let locks: string[] = [];

  const nameOf = (i: number): string => {
    const n = threads[i];
    if (n === undefined) throw new Error(`모르는 스레드 번호 ${i}`);
    return n;
  };
  const lockOf = (m: number): string => {
    const n = locks[m];
    if (n === undefined) throw new Error(`모르는 자물쇠 번호 ${m}`);
    return n;
  };

  return {
    async onEvent(e: FacetRuntimeEvent) {
      if (!stage) return;
      switch (e.type) {
        case 'round': {
          const p = obj(e.payload, 'round');
          threads = strs(p.threads, 'threads');
          locks = strs(p.locks, 'locks');
          const cells: StageCell[] = list(p.cells, 'cells').map((c, i) => {
            const o = obj(c, `cells[${i}]`);
            return { slice: num(o.slice, 'cell.slice'), gap: num(o.gap, 'cell.gap'), deadlock: bool(o.deadlock, 'cell.deadlock'), ticks: num(o.ticks, 'cell.ticks') };
          });
          const r: RoundView = {
            slice: num(p.slice, 'slice'),
            gap: num(p.gap, 'gap'),
            threads,
            locks,
            programs: list(p.programs, 'programs').map((x, i) => strs(x, `programs[${i}]`)),
            sliceLadder: nums(p.sliceLadder, 'sliceLadder'),
            gapLadder: nums(p.gapLadder, 'gapLadder'),
            cells,
          };
          const order = num(p.order, 'order');
          const orderName = order === 1 ? t('label.byNumber', 'By number') : t('label.asWritten', 'As written');
          stage.setCaption(
            t('caption.start', 'Slice: {k} · Work between: {g}', { k: r.slice, g: r.gap }),
            t('caption.order', 'Lock order: {order}', { order: orderName }),
          );
          await stage.showRound(r, motion());
          return;
        }
        case 'chunk': {
          const p = obj(e.payload, 'chunk');
          const who = num(p.thread, 'thread');
          const from = num(p.from, 'from');
          const to = num(p.to, 'to');
          const lines = list(p.lines, 'lines').map((l, i): { line: number; outcome: 'ran' | 'blocked' } => {
            const o = obj(l, `lines[${i}]`);
            const outcome = o.outcome;
            if (outcome !== 'ran' && outcome !== 'blocked') throw new Error(`lines[${i}].outcome 을 모른다`);
            return { line: num(o.line, 'line'), outcome };
          });
          const notes = list(p.notes, 'notes').map((n, i) => {
            const o = obj(n, `notes[${i}]`);
            const kind = o.kind;
            const th = num(o.thread, 'note.thread');
            if (kind === 'blocked') {
              return t('note.blocked', 'Asleep: {thread} → {owner} ({lock})', {
                thread: nameOf(th),
                owner: nameOf(num(o.to, 'note.to')),
                lock: lockOf(num(o.lock, 'note.lock')),
              });
            }
            if (kind === 'handoff') {
              return t('note.handoff', 'Handoff {lock}: {from} → {to}', {
                lock: lockOf(num(o.lock, 'note.lock')),
                from: nameOf(th),
                to: nameOf(num(o.to, 'note.to')),
              });
            }
            if (kind === 'done') return t('note.done', 'Done: {thread}', { thread: nameOf(th) });
            throw new Error(`notes[${i}].kind 를 모른다: ${String(kind)}`);
          });
          const c: ChunkView = {
            thread: who,
            lines,
            pc: nums(p.pc, 'pc'),
            states: list(p.states, 'states').map((s, i) => stateOf(s, `states[${i}]`)),
            held: list(p.held, 'held').map((h, i) => nums(h, `held[${i}]`)),
            arrows: arrowsOf(p.arrows),
          };
          const head =
            from === to
              ? t('caption.tick', 'Tick {n} · {thread}', { n: from, thread: nameOf(who) })
              : t('caption.chunk', 'Tick {from}–{to} · {thread}', { from, to, thread: nameOf(who) });
          const ran = t('caption.ran', 'Lines run: {n}', { n: lines.length });
          stage.setCaption(head, [ran, ...notes].join(' · '));
          await stage.showChunk(c, motion());
          return;
        }
        case 'result': {
          const p = obj(e.payload, 'result');
          const deadlock = bool(p.deadlock, 'deadlock');
          const ticks = num(p.ticks, 'ticks');
          const cycle = nums(p.cycle, 'cycle');
          const tickLine = t('caption.ticks', 'Ticks: {n}', { n: ticks });
          if (deadlock) {
            if (cycle.length === 0) throw new Error('교착인데 고리가 비었다');
            const path = [...cycle, cycle[0]!].map(nameOf).join(' → ');
            stage.setCaption(t('caption.cycle', 'Cycle: {path}', { path }), tickLine);
          } else {
            stage.setCaption(tickLine, '');
          }
          await stage.showResult({ deadlock, cycle }, motion());
          return;
        }
        default:
          return;
      }
    },
  };
};
