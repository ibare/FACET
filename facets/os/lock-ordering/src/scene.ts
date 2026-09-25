/**
 * lock-ordering 장면 — 이벤트를 잇기만 한다. 차례 · 주인 · 기다림의 셈은 알고리즘이 한다.
 *
 * 바탕: 자물쇠(번호 차례) · 스레드 차례 · 프로그램 (규칙 걸기가 한 번 바꾼다)
 * 자취: 주인 · 기다림 · 줄 번호 · 끝난 차례
 * 이번 걸음: step — 틱의 계기값으로 앞 걸음의 주인 · 기다림(`wasOwners` · `wasWaits` · `wasDone`)을 싣는다
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { lockRank, type Line } from './algorithm';

export type SceneLock = { id: string; rank: number };
export type SceneProgram = { thread: string; lines: Line[] };
export type Owner = { lock: string; owner: string | null };
export type Wait = { thread: string; lock: string };

export type RuleChange = { thread: string; before: Line[]; after: Line[] };

export type TickStep = {
  kind: 'take' | 'block' | 'work' | 'release';
  tick: number;
  thread: string;
  line: number;
  lock: string | null;
  holder: string | null;
  to: string | null;
  held: string[];
  upward: boolean | null;
  wasOwners: Owner[];
  wasWaits: Wait[];
  wasDone: string[];
};

export type LockOrderingStep = { kind: 'rule'; changes: RuleChange[] } | TickStep | null;

export type LockOrderingScene = {
  locks: SceneLock[];
  programs: SceneProgram[];
  ruled: boolean;
  /** 처음 쓰인 프로그램에서 높은 번호를 먼저 잡는 스레드 (바탕 — initial 이 정한다) */
  writtenDown: string[];
  owners: Owner[];
  waits: Wait[];
  pc: { thread: string; pc: number }[];
  done: string[];
  step: LockOrderingStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`lock-ordering scene: ${what} 가 글자가 아니다`);
  return v;
}

function strOrNull(v: unknown, what: string): string | null {
  if (v === null) return null;
  return str(v, what);
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`lock-ordering scene: ${what} 가 수가 아니다`);
  }
  return v;
}

function arr(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`lock-ordering scene: ${what} 가 목록이 아니다`);
  return v;
}

export function readLine(v: unknown): Line {
  if (!isRecord(v)) throw new Error('lock-ordering scene: 줄 모양이 아니다');
  const op = v['op'];
  if (op === 'work') return { op: 'work' };
  if (op === 'lock') return { op: 'lock', lock: str(v['lock'], 'lock 줄의 자물쇠') };
  if (op === 'unlock') return { op: 'unlock', lock: str(v['lock'], 'unlock 줄의 자물쇠') };
  throw new Error(`lock-ordering scene: 모르는 줄 ${String(op)}`);
}

function readOwners(v: unknown): Owner[] {
  return arr(v, 'owners').map((o) => {
    if (!isRecord(o)) throw new Error('lock-ordering scene: owners 칸 모양이 아니다');
    return { lock: str(o['lock'], 'owners.lock'), owner: strOrNull(o['owner'], 'owners.owner') };
  });
}

function readWaits(v: unknown): Wait[] {
  return arr(v, 'waits').map((o) => {
    if (!isRecord(o)) throw new Error('lock-ordering scene: waits 칸 모양이 아니다');
    return { thread: str(o['thread'], 'waits.thread'), lock: str(o['lock'], 'waits.lock') };
  });
}

function initial(initialData: unknown): LockOrderingScene {
  if (!isRecord(initialData)) {
    return { locks: [], programs: [], ruled: false, writtenDown: [], owners: [], waits: [], pc: [], done: [], step: null };
  }
  const locks = arr(initialData['locks'], 'locks')
    .map((l) => str(l, 'locks 칸'))
    .map((id) => ({ id, rank: lockRank(id) }));
  const programs = arr(initialData['threads'], 'threads').map((th) => {
    if (!isRecord(th)) throw new Error('lock-ordering scene: 스레드 모양이 아니다');
    return {
      thread: str(th['id'], 'threads.id'),
      lines: arr(th['program'], 'threads.program').map(readLine),
    };
  });
  const writtenDown = programs.flatMap((p) => {
    const takes = p.lines.flatMap((l) => (l.op === 'lock' ? [l.lock] : []));
    const a = takes[0];
    const b = takes[1];
    if (a === undefined || b === undefined) return [];
    return lockRank(a) > lockRank(b) ? [p.thread] : [];
  });
  return {
    locks,
    programs,
    ruled: false,
    writtenDown,
    owners: locks.map((l) => ({ lock: l.id, owner: null })),
    waits: [],
    pc: programs.map((p) => ({ thread: p.thread, pc: 0 })),
    done: [],
    step: null,
  };
}

function reduce(scene: LockOrderingScene, event: FacetRuntimeEvent): LockOrderingScene {
  const p = event.payload;
  if (event.type === 'rule') {
    if (!isRecord(p)) throw new Error('lock-ordering scene: rule payload 모양이 아니다');
    const changes = arr(p['changes'], 'changes').map((c): RuleChange => {
      if (!isRecord(c)) throw new Error('lock-ordering scene: rule 칸 모양이 아니다');
      return {
        thread: str(c['thread'], 'changes.thread'),
        before: arr(c['before'], 'changes.before').map(readLine),
        after: arr(c['after'], 'changes.after').map(readLine),
      };
    });
    const programs = scene.programs.map((prog) => {
      const ch = changes.find((c) => c.thread === prog.thread);
      return ch === undefined ? prog : { thread: prog.thread, lines: ch.after };
    });
    return { ...scene, programs, ruled: true, step: { kind: 'rule', changes } };
  }
  if (event.type === 'tick') {
    if (!isRecord(p)) throw new Error('lock-ordering scene: tick payload 모양이 아니다');
    const kind = p['kind'];
    if (kind !== 'take' && kind !== 'block' && kind !== 'work' && kind !== 'release') {
      throw new Error(`lock-ordering scene: 모르는 틱 종류 ${String(kind)}`);
    }
    const upward = p['upward'];
    if (upward !== null && typeof upward !== 'boolean') {
      throw new Error('lock-ordering scene: upward 가 참거짓이 아니다');
    }
    const step: TickStep = {
      kind,
      tick: num(p['tick'], 'tick'),
      thread: str(p['thread'], 'thread'),
      line: num(p['line'], 'line'),
      lock: strOrNull(p['lock'], 'lock'),
      holder: strOrNull(p['holder'], 'holder'),
      to: strOrNull(p['to'], 'to'),
      held: arr(p['held'], 'held').map((h) => str(h, 'held 칸')),
      upward,
      wasOwners: scene.owners.map((o) => ({ ...o })),
      wasWaits: scene.waits.map((w) => ({ ...w })),
      wasDone: [...scene.done],
    };
    const pc = arr(p['pc'], 'pc').map((o) => {
      if (!isRecord(o)) throw new Error('lock-ordering scene: pc 칸 모양이 아니다');
      return { thread: str(o['thread'], 'pc.thread'), pc: num(o['pc'], 'pc.pc') };
    });
    return {
      ...scene,
      owners: readOwners(p['owners']),
      waits: readWaits(p['waits']),
      pc,
      done: arr(p['done'], 'done').map((d) => str(d, 'done 칸')),
      step,
    };
  }
  return scene;
}

export const lockOrderingScene: ScenePlan<LockOrderingScene> = { initial, reduce };
