/**
 * raft projector — algorithm 이벤트를 raft-stage 메서드와 코드 패널 강조로 옮긴다.
 *
 * payload 는 typeof 가드로 읽고, 모르는 모양이면 던진다. 운동 길이는 재생 속도를 그때그때 읽는다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { Lane, RaftStage } from './raft-stage.js';

/** 운동 한 번의 길이 (재생 속도 1 에서) */
const MOTION_MS = 500;

type CodePanel = { highlightPhase(phase: string | null): void; clearHighlight(): void };

type Rec = Record<string, unknown>;

function rec(e: FacetRuntimeEvent): Rec {
  const p = e.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`raft: ${e.type} 의 payload 가 없다`);
  return p as Rec;
}
function num(p: Rec, k: string): number {
  const v = p[k];
  if (typeof v !== 'number') throw new Error(`raft: payload.${k} 가 수가 아니다`);
  return v;
}
function str(p: Rec, k: string): string {
  const v = p[k];
  if (typeof v !== 'string') throw new Error(`raft: payload.${k} 가 글이 아니다`);
  return v;
}
function bool(p: Rec, k: string): boolean {
  const v = p[k];
  if (typeof v !== 'boolean') throw new Error(`raft: payload.${k} 가 참거짓이 아니다`);
  return v;
}
function strs(p: Rec, k: string): string[] {
  const v = p[k];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw new Error(`raft: payload.${k} 가 글 목록이 아니다`);
  return v as string[];
}
function nums(p: Rec, k: string): number[] {
  const v = p[k];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number')) throw new Error(`raft: payload.${k} 가 수 목록이 아니다`);
  return v as number[];
}
function lane(p: Rec): Lane {
  const v = p.lane;
  if (v === 'vote' || v === 'copy') return v;
  throw new Error(`raft: 모르는 레인 ${String(v)}`);
}

export const raftProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as RaftStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const dur = (): number => {
    if (!runtime) return MOTION_MS;
    const speed = runtime.getSpeed();
    if (!(speed > 0)) throw new Error(`raft: 재생 속도 ${speed} 가 양수가 아니다`);
    return MOTION_MS / speed;
  };

  return {
    onEvent(e) {
      switch (e.type) {
        case 'phase': {
          const p = rec(e);
          code?.highlightPhase(str(p, 'phase'));
          return;
        }
        case 'round': {
          if (!stage) return;
          const p = rec(e);
          stage.round(
            {
              n: num(p, 'n'),
              nodes: strs(p, 'nodes'),
              down: strs(p, 'down'),
              stopped: num(p, 'stopped'),
              majority: num(p, 'majority'),
              tolerance: num(p, 'tolerance'),
              term: num(p, 'term'),
              rtt: nums(p, 'rtt'),
              thresholdMs: num(p, 'thresholdMs'),
              thresholdNode: str(p, 'thresholdNode'),
              thresholdAlive: bool(p, 'thresholdAlive'),
              command: str(p, 'command'),
            },
            dur(),
          );
          return;
        }
        case 'no-candidate': {
          if (!stage) return;
          const p = rec(e);
          stage.noCandidate({ votes: num(p, 'votes'), n: num(p, 'n') }, dur());
          return;
        }
        case 'candidate': {
          if (!stage) return;
          const p = rec(e);
          stage.candidate(
            { node: str(p, 'node'), term: num(p, 'term'), votes: num(p, 'votes'), n: num(p, 'n'), requested: strs(p, 'requested') },
            dur(),
          );
          return;
        }
        case 'response': {
          if (!stage) return;
          const p = rec(e);
          stage.response(
            {
              lane: lane(p),
              from: str(p, 'from'),
              ms: num(p, 'ms'),
              count: num(p, 'count'),
              n: num(p, 'n'),
              majority: num(p, 'majority'),
              reached: bool(p, 'reached'),
              leader: str(p, 'leader'),
              term: num(p, 'term'),
            },
            dur(),
          );
          return;
        }
        case 'overflow': {
          if (!stage) return;
          const p = rec(e);
          stage.overflow(
            { lane: lane(p), from: strs(p, 'from'), ms: nums(p, 'ms'), count: num(p, 'count'), n: num(p, 'n') },
            dur(),
          );
          return;
        }
        case 'no-majority': {
          if (!stage) return;
          const p = rec(e);
          stage.noMajority({ votes: num(p, 'votes'), n: num(p, 'n'), majority: num(p, 'majority') }, dur());
          return;
        }
        case 'write': {
          if (!stage) return;
          const p = rec(e);
          stage.write(
            {
              node: str(p, 'node'),
              command: str(p, 'command'),
              index: num(p, 'index'),
              term: num(p, 'term'),
              count: num(p, 'count'),
              n: num(p, 'n'),
            },
            dur(),
          );
          return;
        }
        case 'done': {
          if (!stage) return;
          const p = rec(e);
          stage.done(
            {
              leader: str(p, 'leader'),
              electMs: num(p, 'electMs'),
              commitMs: num(p, 'commitMs'),
              count: num(p, 'count'),
              n: num(p, 'n'),
              missing: strs(p, 'missing'),
            },
            dur(),
          );
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      code?.clearHighlight();
    },
  };
};
