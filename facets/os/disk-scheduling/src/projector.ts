/**
 * 디스크 스케줄링 projector — algorithm 이벤트를 stage 메서드로 옮긴다.
 *
 *   round   → stage.round  (꺾은선이 새 받은 차례로 다시 꺾이고 막대 · 가장 짧음 표시가 옮겨 간다)
 *   move    → stage.move   (팔이 다음 실린더로 미끄러진다)
 *   finish  → stage.finish
 *   phase   → codePanel.highlightPhase
 *
 * 운동 길이는 MOTION_MS 를 재생 속도로 나눈 값이다 — 걸음마다 그때그때 읽는다.
 * 걸음 = 운동 + stepMs (900) 이라 한 걸음 1400ms.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { DiskSchedulingStage, MoveView, RoundView } from './disk-scheduling-stage.js';

const MOTION_MS = 500;

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };

function obj(p: unknown, what: string): Record<string, unknown> {
  if (typeof p !== 'object' || p === null) throw new Error(`disk-scheduling projector: ${what} payload 가 없다`);
  return p as Record<string, unknown>;
}
function num(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`disk-scheduling projector: ${key} 가 수가 아니다`);
  return v;
}
function nums(o: Record<string, unknown>, key: string): number[] {
  const v = o[key];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number')) {
    throw new Error(`disk-scheduling projector: ${key} 가 수 목록이 아니다`);
  }
  return v as number[];
}
const KINDS = ['arrival', 'nearest', 'ahead', 'edge', 'turn', 'wrap'] as const;
function kindOf(o: Record<string, unknown>): MoveView['kind'] {
  const v = o.kind;
  const found = KINDS.find((k) => k === v);
  if (found === undefined) throw new Error(`disk-scheduling projector: 모르는 움직임 '${String(v)}'`);
  return found;
}

export const diskSchedulingProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as DiskSchedulingStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const motion = (): number => MOTION_MS / Math.max(0.01, runtime?.getSpeed() ?? 1);
  let requestCount = 0;

  return {
    onInit(data) {
      const d = obj(data, 'initialData');
      const requests = nums(d, 'requests');
      requestCount = requests.length;
      stage?.reset();
      stage?.setup(num(d, 'top'), requests, num(d, 'armStart'));
      code?.clearHighlight?.();
    },
    async onEvent(e: FacetRuntimeEvent) {
      switch (e.type) {
        case 'phase': {
          const p = obj(e.payload, 'phase');
          const ph = p.phase;
          if (typeof ph !== 'string') throw new Error('disk-scheduling projector: phase 가 글자가 아니다');
          code?.highlightPhase?.(ph);
          return;
        }
        case 'round': {
          const p = obj(e.payload, 'round');
          const r: RoundView = {
            policy: num(p, 'policy'),
            start: num(p, 'start'),
            top: num(p, 'top'),
            requests: nums(p, 'requests'),
            visits: nums(p, 'visits'),
            totals: nums(p, 'totals'),
            shortest: num(p, 'shortest'),
          };
          requestCount = r.requests.length;
          code?.clearHighlight?.();
          await stage?.round(r, motion());
          return;
        }
        case 'move': {
          const p = obj(e.payload, 'move');
          const up = p.up;
          if (typeof up !== 'boolean') throw new Error('disk-scheduling projector: up 이 참거짓이 아니다');
          const m: MoveView = {
            step: num(p, 'step'),
            from: num(p, 'from'),
            to: num(p, 'to'),
            dist: num(p, 'dist'),
            total: num(p, 'total'),
            kind: kindOf(p),
            request: num(p, 'request'),
            up,
          };
          await stage?.move(m, motion());
          return;
        }
        case 'finish': {
          const p = obj(e.payload, 'finish');
          num(p, 'total');
          stage?.finish(num(p, 'policy'), requestCount);
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      stage?.reset();
      code?.clearHighlight?.();
    },
  };
};
