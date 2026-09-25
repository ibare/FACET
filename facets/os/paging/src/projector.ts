/**
 * paging projector — algorithm 이벤트를 paging-stage 와 코드 패널 호출로 옮긴다.
 *
 *   run-start → stage.startRun(slots, 운동 길이)   TLB 칸이 열리고 닫힌다
 *   translate → stage.translate(step, 운동 길이)   주소가 갈라지고 다시 붙는다 · 표지가 옮겨 붙는다
 *   phase     → codePanel.highlightPhase(phase)
 *
 * 운동 길이는 걸음마다 `runtime.getSpeed()` 를 새로 읽어 정한다 (속도 1 에서 350ms).
 */
import type { ProjectorFactory, ViewInstance } from '@ffacet/core/runtime';
import type { PagingStage, PagingStep } from './paging-stage.js';

const MOTION_MS = 350;

type CodePanel = { highlightPhase?: (phase: string | null) => void; clearHighlight?: () => void };

function obj(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error(`paging projector: ${what} 가 객체가 아니다`);
  return value as Record<string, unknown>;
}

function num(p: Record<string, unknown>, key: string): number {
  const value = p[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`paging projector: ${key} 가 수가 아니다`);
  return value;
}

function nums(p: Record<string, unknown>, key: string): number[] {
  const value = p[key];
  if (!Array.isArray(value) || value.some((x) => typeof x !== 'number')) {
    throw new Error(`paging projector: ${key} 가 수의 목록이 아니다`);
  }
  return value as number[];
}

export const pagingProjector: ProjectorFactory = (views: Record<string, ViewInstance>, runtime) => {
  const stage = views.stage as unknown as PagingStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const motion = (): number => {
    const speed = runtime?.getSpeed() ?? 1;
    return speed > 0 ? MOTION_MS / speed : 0;
  };

  return {
    onInit(data: unknown) {
      if (!stage) return;
      const d = obj(data, 'initialData');
      const ladder = nums(d, 'tlbLadder');
      stage.setup({
        addresses: nums(d, 'addresses'),
        pageTable: nums(d, 'pageTable'),
        pageBytes: num(d, 'pageBytes'),
        maxSlots: Math.max(...ladder),
      });
    },

    async onEvent(e) {
      switch (e.type) {
        case 'phase': {
          const phase = obj(e.payload, 'phase payload').phase;
          if (typeof phase !== 'string') throw new Error('paging projector: phase 이름이 없다');
          code?.highlightPhase?.(phase);
          return;
        }
        case 'run-start': {
          const p = obj(e.payload, 'run-start payload');
          // 새 판의 #0 — 앞 판의 코드 줄을 끈다.
          code?.clearHighlight?.();
          await stage?.startRun(num(p, 'slots'), motion());
          return;
        }
        case 'translate': {
          const p = obj(e.payload, 'translate payload');
          const route = p.route;
          if (route !== 'hit' && route !== 'walk') throw new Error(`paging projector: 모르는 길 — ${String(route)}`);
          const step: PagingStep = {
            index: num(p, 'index'),
            address: num(p, 'address'),
            page: num(p, 'page'),
            offset: num(p, 'offset'),
            route,
            slot: num(p, 'slot'),
            frame: num(p, 'frame'),
            evicted: num(p, 'evicted'),
            physical: num(p, 'physical'),
            hitRate: num(p, 'hitRate'),
          };
          await stage?.translate(step, motion());
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
