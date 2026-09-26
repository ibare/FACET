/**
 * 배압 projector — algorithm 이벤트를 무대 메서드로 옮긴다.
 *
 * payload 는 typeof 가드로 읽고, 모양이 어긋나면 무엇이 없는지 담아 던진다 (C6 · C9).
 * 운동 길이는 재생 속도를 따른다 — 걸음마다 `runtime.getSpeed()` 를 다시 읽어 무대에 넘긴다.
 */
import type { ProjectorFactory, ViewInstance } from '@ffacet/core/runtime';
import type { BackpressureStage, StageArrive, StageInit, StageWork } from './backpressure-stage.js';

type CodePanel = ViewInstance & { highlightPhase(phase: string | null): void; clearHighlight(): void };

type Obj = Record<string, unknown>;

function obj(v: unknown, what: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`backpressure: ${what} 가 객체가 아니다`);
  return v as Obj;
}
function int(o: Obj, key: string, what: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`backpressure: ${what}.${key} 가 정수가 아니다`);
  return v;
}
function bool(o: Obj, key: string, what: string): boolean {
  const v = o[key];
  if (typeof v !== 'boolean') throw new Error(`backpressure: ${what}.${key} 가 참거짓이 아니다`);
  return v;
}
function str(o: Obj, key: string, what: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`backpressure: ${what}.${key} 가 문자열이 아니다`);
  return v;
}
function list(o: Obj, key: string, what: string): unknown[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`backpressure: ${what}.${key} 가 배열이 아니다`);
  return v;
}
function ints(o: Obj, key: string, what: string): number[] {
  return list(o, key, what).map((x) => {
    if (typeof x !== 'number' || !Number.isInteger(x)) throw new Error(`backpressure: ${what}.${key} 에 정수가 아닌 것이 있다`);
    return x;
  });
}

function readInit(raw: unknown): StageInit {
  const o = obj(raw, 'init');
  return {
    overflow: int(o, 'overflow', 'init'),
    rate: int(o, 'rate', 'init'),
    ticks: int(o, 'ticks', 'init'),
    workUnits: int(o, 'workUnits', 'init'),
    capacity: int(o, 'capacity', 'init'),
    deadline: int(o, 'deadline', 'init'),
    limit: int(o, 'limit', 'init'),
    rejectCode: str(o, 'rejectCode', 'init'),
    peakHeld: int(o, 'peakHeld', 'init'),
    peakQueue: int(o, 'peakQueue', 'init'),
    motionMs: int(o, 'motionMs', 'init'),
  };
}

function readWork(raw: unknown): StageWork {
  const o = obj(raw, 'work');
  return {
    tick: int(o, 'tick', 'work'),
    heldBefore: int(o, 'heldBefore', 'work'),
    share: int(o, 'share', 'work'),
    extra: int(o, 'extra', 'work'),
    jobs: list(o, 'jobs', 'work').map((j) => {
      const r = obj(j, 'work.jobs[]');
      return {
        id: int(r, 'id', 'work.jobs[]'),
        born: int(r, 'born', 'work.jobs[]'),
        done: int(r, 'done', 'work.jobs[]'),
        gain: int(r, 'gain', 'work.jobs[]'),
        overdue: bool(r, 'overdue', 'work.jobs[]'),
      };
    }),
    finished: list(o, 'finished', 'work').map((f) => {
      const r = obj(f, 'work.finished[]');
      return { id: int(r, 'id', 'work.finished[]'), born: int(r, 'born', 'work.finished[]'), onTime: bool(r, 'onTime', 'work.finished[]') };
    }),
    onTime: int(o, 'onTime', 'work'),
    late: int(o, 'late', 'work'),
    made: int(o, 'made', 'work'),
    onTimePct: int(o, 'onTimePct', 'work'),
  };
}

function readArrive(raw: unknown): StageArrive {
  const o = obj(raw, 'arrive');
  return {
    tick: int(o, 'tick', 'arrive'),
    created: list(o, 'created', 'arrive').map((c) => {
      const r = obj(c, 'arrive.created[]');
      return { id: int(r, 'id', 'arrive.created[]'), born: int(r, 'born', 'arrive.created[]') };
    }),
    admitted: list(o, 'admitted', 'arrive').map((a) => {
      const r = obj(a, 'arrive.admitted[]');
      return {
        id: int(r, 'id', 'arrive.admitted[]'),
        born: int(r, 'born', 'arrive.admitted[]'),
        overdue: bool(r, 'overdue', 'arrive.admitted[]'),
      };
    }),
    rejected: ints(o, 'rejected', 'arrive'),
    dropped: ints(o, 'dropped', 'arrive'),
    queue: ints(o, 'queue', 'arrive'),
    held: int(o, 'held', 'arrive'),
    rejectedTotal: int(o, 'rejectedTotal', 'arrive'),
    droppedTotal: int(o, 'droppedTotal', 'arrive'),
    made: int(o, 'made', 'arrive'),
    onTimePct: int(o, 'onTimePct', 'arrive'),
  };
}

export const backpressureProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as BackpressureStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  if (stage === undefined) throw new Error('backpressure: stage 블록이 없다');
  const speed = (): number => {
    if (runtime === undefined) return 1;
    const s = runtime.getSpeed();
    if (!(s > 0)) throw new Error(`backpressure: 재생 속도 ${s} 가 양수가 아니다`);
    return s;
  };

  return {
    onInit(): void {
      codePanel?.highlightPhase(null);
    },
    onEvent(event): void {
      switch (event.type) {
        case 'init':
          // 판 머리 — 앞 판의 코드 줄 강조를 끄고 무대를 새로 짓는다 (멱등)
          codePanel?.highlightPhase(null);
          stage.init(readInit(event.payload));
          return;
        case 'phase': {
          const p = obj(event.payload, 'phase');
          codePanel?.highlightPhase(str(p, 'phase', 'phase'));
          return;
        }
        case 'work': {
          const work = readWork(event.payload);
          // 든 것이 없는 일 걸음은 IR 의 몫 나누기에 닿지 않는다 — 코드 줄 강조를 끈다
          if (work.heldBefore === 0) codePanel?.highlightPhase(null);
          stage.work(work, speed());
          return;
        }
        case 'arrive':
          stage.arrive(readArrive(event.payload), speed());
          return;
        default:
          throw new Error(`backpressure: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset(): void {
      stage.reset();
      codePanel?.clearHighlight();
    },
  };
};
