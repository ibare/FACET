/**
 * priority-aging projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * setup → stage.setup · round → stage.beginRound · step → stage.applyStep · roundEnd → stage.endRound ·
 * phase → 코드 패널 highlightPhase. payload 는 모두 typeof 로 좁히고, 비어 있으면 던진다.
 * 움직임의 길이는 운동 상한(400ms)을 지금 재생 속도로 나눈 것 — 걸음마다 그때그때 읽는다.
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type {
  PriorityAgingStage,
  StageProc,
  StageProcState,
  StageSetup,
  StageStep,
  StageSummary,
} from './priority-aging-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void; clearHighlight?: () => void };

const MOTION_MS = 400;

type Obj = Record<string, unknown>;

function obj(x: unknown, what: string): Obj {
  if (typeof x !== 'object' || x === null) throw new Error(`priority-aging projector: ${what} 가 객체가 아니다`);
  return x as Obj;
}
function num(o: Obj, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`priority-aging projector: ${key} 가 수가 아니다`);
  return v;
}
function str(o: Obj, key: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`priority-aging projector: ${key} 가 문자열이 아니다`);
  return v;
}
function strOrNull(o: Obj, key: string): string | null {
  const v = o[key];
  if (v === null) return null;
  if (typeof v !== 'string') throw new Error(`priority-aging projector: ${key} 가 문자열이 아니다`);
  return v;
}
function numOrNull(o: Obj, key: string): number | null {
  const v = o[key];
  if (v === null) return null;
  if (typeof v !== 'number') throw new Error(`priority-aging projector: ${key} 가 수가 아니다`);
  return v;
}
function arr(o: Obj, key: string): unknown[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`priority-aging projector: ${key} 가 배열이 아니다`);
  return v;
}
function strs(o: Obj, key: string): string[] {
  return arr(o, key).map((x) => {
    if (typeof x !== 'string') throw new Error(`priority-aging projector: ${key} 에 문자열이 아닌 것이 있다`);
    return x;
  });
}

const STATES: readonly StageProcState[] = ['pending', 'queued', 'running', 'done'];

function procs(o: Obj): StageProc[] {
  return arr(o, 'procs').map((x) => {
    const p = obj(x, 'procs[]');
    const state = str(p, 'state');
    const known = STATES.find((s) => s === state);
    if (!known) throw new Error(`priority-aging projector: 모르는 상태 ${state}`);
    return { id: str(p, 'id'), state: known, eff: num(p, 'eff'), seq: num(p, 'seq'), wait: num(p, 'wait'), doneAt: num(p, 'doneAt') };
  });
}

function parseSetup(payload: unknown): StageSetup {
  const o = obj(payload, 'setup');
  return {
    procs: arr(o, 'procs').map((x) => {
      const p = obj(x, 'setup.procs[]');
      return { id: str(p, 'id'), arrive: num(p, 'arrive'), prio: num(p, 'prio') };
    }),
    levels: num(o, 'levels'),
    horizon: num(o, 'horizon'),
  };
}

function parseStep(payload: unknown): StageStep {
  const o = obj(payload, 'step');
  return {
    tick: num(o, 'tick'),
    until: num(o, 'until'),
    finished: strOrNull(o, 'finished'),
    arrived: strs(o, 'arrived'),
    aged: arr(o, 'aged').map((x) => {
      const a = obj(x, 'aged[]');
      return { id: str(a, 'id'), from: num(a, 'from'), to: num(a, 'to') };
    }),
    dispatched: strOrNull(o, 'dispatched'),
    tie: strs(o, 'tie'),
    level: numOrNull(o, 'level'),
    procs: procs(o),
    run: strOrNull(o, 'run'),
  };
}

function parseSummary(payload: unknown): StageSummary {
  const o = obj(payload, 'roundEnd');
  return { reportStart: num(o, 'reportStart'), reportWait: num(o, 'reportWait'), highWait: num(o, 'highWait') };
}

export const priorityAgingProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as PriorityAgingStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const motion = (): number => {
    const speed = runtime?.getSpeed() ?? 1;
    return speed > 0 ? MOTION_MS / speed : MOTION_MS;
  };
  return {
    onEvent(e) {
      switch (e.type) {
        case 'setup':
          stage?.setup(parseSetup(e.payload));
          return;
        case 'round': {
          const o = obj(e.payload, 'round');
          stage?.beginRound(num(o, 'interval'), procs(o), motion());
          return;
        }
        case 'step':
          stage?.applyStep(parseStep(e.payload), motion());
          return;
        case 'roundEnd':
          stage?.endRound(parseSummary(e.payload));
          return;
        case 'phase': {
          const o = obj(e.payload, 'phase');
          code?.highlightPhase?.(str(o, 'phase'));
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      stage?.clear();
      code?.clearHighlight?.();
    },
  };
};
