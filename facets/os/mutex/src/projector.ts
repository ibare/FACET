/**
 * mutex projector — 알고리즘의 `round` · `chunk` · `done` 을 무대 메서드로 옮긴다.
 *
 * 셈은 하지 않는다. payload 를 typeof 로 좁혀 무대에 넘기고, 캡션 문안을 고른다. 운동 길이는
 * 부를 때마다 `runtime.getSpeed()` 를 읽어 정한다 — 1 배속에서 300ms.
 */
import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';
import type { MutexStage, StageChunk, StageRound, StageTick } from './mutex-stage.js';

const MOTION_MS = 300;

type Obj = Record<string, unknown>;

function obj(v: unknown, what: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`${what} 가 객체가 아니다`);
  return v as Obj;
}
function num(o: Obj, k: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${k} 가 수가 아니다`);
  return v;
}
function str(o: Obj, k: string): string {
  const v = o[k];
  if (typeof v !== 'string') throw new Error(`${k} 가 글자가 아니다`);
  return v;
}
function nums(o: Obj, k: string): number[] {
  const v = o[k];
  if (!Array.isArray(v)) throw new Error(`${k} 가 목록이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'number') throw new Error(`${k} 의 원소가 수가 아니다`);
    return x;
  });
}
function strs(o: Obj, k: string): string[] {
  const v = o[k];
  if (!Array.isArray(v)) throw new Error(`${k} 가 목록이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'string') throw new Error(`${k} 의 원소가 글자가 아니다`);
    return x;
  });
}
function bools(o: Obj, k: string): boolean[] {
  const v = o[k];
  if (!Array.isArray(v)) throw new Error(`${k} 가 목록이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'boolean') throw new Error(`${k} 의 원소가 참거짓이 아니다`);
    return x;
  });
}
function numOrNull(o: Obj, k: string): number | null {
  const v = o[k];
  if (v === null) return null;
  if (typeof v !== 'number') throw new Error(`${k} 가 수도 null 도 아니다`);
  return v;
}

function readRound(p: Obj): StageRound {
  const lock = p['lock'];
  if (lock !== null && typeof lock !== 'string') throw new Error('lock 이 글자도 null 도 아니다');
  return {
    threads: strs(p, 'threads'),
    program: strs(p, 'program'),
    shared: str(p, 'shared'),
    register: str(p, 'register'),
    lock,
    start: num(p, 'start'),
  };
}

function readTick(v: unknown): StageTick {
  const o = obj(v, 'tick');
  const lostRaw = o['lost'];
  let lost: StageTick['lost'] = null;
  if (lostRaw !== null) {
    const l = obj(lostRaw, 'lost');
    lost = { old: num(l, 'old'), new: num(l, 'new') };
  }
  const blocked = o['blocked'];
  if (typeof blocked !== 'boolean') throw new Error('blocked 가 참거짓이 아니다');
  return {
    tick: num(o, 'tick'),
    thread: num(o, 'thread'),
    line: num(o, 'line'),
    text: str(o, 'text'),
    nth: num(o, 'nth'),
    blocked,
    lost,
    owner: numOrNull(o, 'owner'),
    holder: numOrNull(o, 'holder'),
  };
}

function readChunk(p: Obj): StageChunk {
  const ticksRaw = p['ticks'];
  if (!Array.isArray(ticksRaw) || ticksRaw.length === 0) throw new Error('토막에 틱이 없다');
  const regsRaw = p['regs'];
  if (!Array.isArray(regsRaw)) throw new Error('regs 가 목록이 아니다');
  const regs = regsRaw.map((x) => {
    if (x === null) return null;
    if (typeof x !== 'number') throw new Error('regs 의 원소가 수도 null 도 아니다');
    return x;
  });
  return {
    thread: num(p, 'thread'),
    ticks: ticksRaw.map(readTick),
    count: num(p, 'count'),
    regs,
    pcs: nums(p, 'pcs'),
    asleep: bools(p, 'asleep'),
    finished: bools(p, 'finished'),
    owner: numOrNull(p, 'owner'),
    queue: nums(p, 'queue'),
  };
}

export const mutexProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as MutexStage | undefined;
  const t = runtime?.t ?? makeTranslator();
  const motion = (): number => MOTION_MS / Math.max(0.01, runtime?.getSpeed() ?? 1);
  let threads: string[] = [];

  return {
    onEvent(e: FacetRuntimeEvent) {
      if (!stage) return;
      if (e.type !== 'round' && e.type !== 'chunk' && e.type !== 'done') return;
      const p = obj(e.payload, `${e.type} 의 payload`);
      switch (e.type) {
        case 'round': {
          const r = readRound(p);
          threads = r.threads;
          stage.begin(r, t('caption.start', 'Slice: {k}', { k: num(p, 'slice') }), motion());
          break;
        }
        case 'chunk': {
          const ch = readChunk(p);
          const from = num(p, 'from');
          const to = num(p, 'to');
          const thread = threads[ch.thread];
          if (thread === undefined) throw new Error(`스레드 ${ch.thread} 의 이름이 없다`);
          const cap =
            from === to
              ? t('caption.tick', 'Tick {n} · {thread}', { n: from, thread })
              : t('caption.chunk', 'Tick {from}–{to} · {thread}', { from, to, thread });
          stage.chunk(ch, cap, motion());
          break;
        }
        case 'done':
          stage.finish(
            t('caption.done', 'Count: {n} · Expected: {expected}', { n: num(p, 'count'), expected: num(p, 'expected') }),
            motion(),
          );
          break;
      }
    },
    onReset() {
      stage?.reset();
    },
  };
};
