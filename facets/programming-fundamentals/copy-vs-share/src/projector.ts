/**
 * copyVsShare projector — 알고리즘 이벤트를 stage 의 건너감으로 옮긴다.
 *
 * 운동 길이는 걸음 간격(stepMs)의 일부를 **지금의** 재생 속도로 나눠 이벤트마다 셈한다 —
 * 속도를 올리면 운동도 따라 짧아져 걸음 경계를 넘지 않는다.
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type { CopyVsSharePass, CopyVsShareStage } from './copy-vs-share-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };

const MOTION_SHARE = 0.6; // 걸음 간격 중 운동이 차지하는 몫

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const numList = (v: unknown): number[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === 'number') ? (v as number[]) : null;
const passOf = (v: unknown): CopyVsSharePass | null =>
  v === 'number' || v === 'list' || v === 'cell' ? v : null;

export const copyVsShareProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as CopyVsShareStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  let stepMs = 900;

  const dur = (): number => {
    const speed = runtime?.getSpeed() ?? 1;
    return Math.max(30, (stepMs * MOTION_SHARE) / Math.max(0.01, speed));
  };

  return {
    onInit(data) {
      const s = num((data as { stepMs?: unknown } | undefined)?.stepMs);
      if (s !== null) stepMs = s;
    },

    onEvent(e) {
      const p = (typeof e.payload === 'object' && e.payload !== null ? e.payload : {}) as Record<string, unknown>;
      switch (e.type) {
        case 'phase': {
          const ph = typeof p.phase === 'string' ? p.phase : null;
          code?.highlightPhase?.(ph);
          return;
        }
        case 'run': {
          const pass = passOf(p.pass);
          const level = num(p.level);
          const cells = numList(p.cells);
          const at = num(p.at);
          const callerValue = num(p.callerValue);
          if (pass === null || level === null || cells === null || at === null) return;
          if (callerValue === null) throw new Error('copyVsShare: run 에 callerValue 가 없다');
          stage?.showRun({ pass, level, cells, at, callerValue }, dur());
          return;
        }
        case 'call': {
          const pass = passOf(p.pass);
          const n = num(p.n);
          const times = num(p.times);
          if (pass === null || n === null || times === null) return;
          stage?.showCall({ pass, n, times, copied: num(p.copied) }, dur());
          return;
        }
        case 'write': {
          const pass = passOf(p.pass);
          const from = num(p.from);
          const to = num(p.to);
          const cells = numList(p.cells);
          const callerValue = num(p.callerValue);
          if (pass === null || from === null || to === null || cells === null || callerValue === null) return;
          stage?.showWrite({ pass, from, to, cells, callerValue }, dur());
          return;
        }
        case 'return': {
          const pass = passOf(p.pass);
          const cells = numList(p.cells);
          const callerValue = num(p.callerValue);
          if (pass === null || cells === null || callerValue === null) return;
          stage?.showReturn({ pass, lost: num(p.lost), cells, callerValue }, dur());
          return;
        }
        case 'read': {
          const pass = passOf(p.pass);
          const value = num(p.value);
          if (pass === null || value === null) return;
          stage?.showRead({ pass, value }, dur());
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
