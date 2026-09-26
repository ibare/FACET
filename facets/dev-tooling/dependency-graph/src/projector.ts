/**
 * dependency-graph projector — algorithm 의 round · tick · stop · phase 를 stage · 코드 패널 호출로 옮긴다.
 *
 * payload 는 typeof 가드로 읽고, 없거나 모양이 틀리면 무엇이 없는지 담아 던진다.
 * 움직임 길이는 재생 속도를 그때그때 읽어 정한다.
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type { DependencyGraphStage, StageRound, StageStart, StageStop, StageTarget, StageTick } from './dependency-graph-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void; clearHighlight?(): void };

const MOTION_MS = 450;

type Obj = Record<string, unknown>;

function obj(v: unknown, what: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`dependency-graph projector: ${what} 가 객체가 아니다`);
  return v as Obj;
}
function num(o: Obj, key: string, what: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`dependency-graph projector: ${what}.${key} 가 수가 아니다`);
  return v;
}
function str(o: Obj, key: string, what: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`dependency-graph projector: ${what}.${key} 가 글자가 아니다`);
  return v;
}
function list(o: Obj, key: string, what: string): unknown[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`dependency-graph projector: ${what}.${key} 가 배열이 아니다`);
  return v;
}
function names(o: Obj, key: string, what: string): string[] {
  return list(o, key, what).map((x) => {
    if (typeof x !== 'string') throw new Error(`dependency-graph projector: ${what}.${key} 에 글자가 아닌 것이 있다`);
    return x;
  });
}

function readRound(payload: unknown): StageRound {
  const p = obj(payload, 'round');
  const targets: StageTarget[] = list(p, 'targets', 'round').map((x) => {
    const o = obj(x, 'round.targets[]');
    return { id: str(o, 'id', 'target'), seconds: num(o, 'seconds', 'target'), needs: names(o, 'needs', 'target') };
  });
  const chain = list(p, 'chain', 'round').map((x) => {
    const o = obj(x, 'round.chain[]');
    return { id: str(o, 'id', 'chain'), seconds: num(o, 'seconds', 'chain') };
  });
  return {
    workers: num(p, 'workers', 'round'),
    laneMax: num(p, 'laneMax', 'round'),
    axisMax: num(p, 'axisMax', 'round'),
    targets,
    chain,
    chainSeconds: num(p, 'chainSeconds', 'round'),
  };
}

function readTick(payload: unknown): StageTick {
  const p = obj(payload, 'tick');
  const started: StageStart[] = list(p, 'started', 'tick').map((x) => {
    const o = obj(x, 'tick.started[]');
    return { id: str(o, 'id', 'start'), lane: num(o, 'lane', 'start'), start: num(o, 'start', 'start'), end: num(o, 'end', 'start') };
  });
  return { t: num(p, 't', 'tick'), finished: names(p, 'finished', 'tick'), started, waiting: names(p, 'waiting', 'tick') };
}

function readStop(payload: unknown): StageStop {
  const p = obj(payload, 'stop');
  return {
    finishTime: num(p, 'finishTime', 'stop'),
    finished: names(p, 'finished', 'stop'),
    chainSeconds: num(p, 'chainSeconds', 'stop'),
    gap: num(p, 'gap', 'stop'),
  };
}

export const dependencyGraphProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as DependencyGraphStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const motion = (): number => {
    const speed = runtime?.getSpeed() ?? 1;
    return speed > 0 ? MOTION_MS / speed : MOTION_MS;
  };
  const need = (): DependencyGraphStage => {
    if (!stage) throw new Error('dependency-graph projector: stage 가 없다');
    return stage;
  };
  return {
    onEvent(event) {
      switch (event.type) {
        case 'round':
          need().round(readRound(event.payload), motion());
          code?.highlightPhase(null);
          return;
        case 'tick':
          need().tick(readTick(event.payload), motion());
          return;
        case 'stop':
          need().stop(readStop(event.payload), motion());
          return;
        case 'phase': {
          const p = obj(event.payload, 'phase');
          code?.highlightPhase(str(p, 'phase', 'phase'));
          return;
        }
        default:
          throw new Error(`dependency-graph projector: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      stage?.reset();
      code?.clearHighlight?.();
    },
  };
};
