/**
 * http projector — 알고리즘 이벤트를 http-stage 메서드와 코드 패널 켜기로 옮긴다.
 *
 * - `run-start` → stage.startRun (눈금이 앞 판 자리에서 새 자리로), 코드 패널 끔
 * - `upgrade`   → stage.showUpgrade
 * - `window`    → stage.playWindow (시각 표식이 창을 지나간다)
 * - `phase`     → codePanel.highlightPhase
 *
 * 운동 길이는 재생 속도를 걸음마다 새로 읽어 맞춘다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { HttpHappeningView, HttpStage, HttpWindowView } from './http-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };

const MOTION_MS = 900;

function record(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error(`http projector: ${what} 가 객체가 아니다`);
  return value as Record<string, unknown>;
}

function num(p: Record<string, unknown>, key: string): number {
  const value = p[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`http projector: ${key} 가 수가 아니다`);
  return value;
}

function nums(p: Record<string, unknown>, key: string): number[] {
  const value = p[key];
  if (!Array.isArray(value)) throw new Error(`http projector: ${key} 가 배열이 아니다`);
  return value.map((x: unknown) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`http projector: ${key} 에 수가 아닌 것`);
    return x;
  });
}

function happenings(p: Record<string, unknown>): HttpHappeningView[] {
  const value = p['happenings'];
  if (!Array.isArray(value)) throw new Error('http projector: happenings 가 배열이 아니다');
  return value.map((raw: unknown) => {
    const h = record(raw, 'happening');
    const kind = h['kind'];
    if (kind !== 'birth' && kind !== 'poll-empty' && kind !== 'poll-deliver' && kind !== 'push') {
      throw new Error(`http projector: 모르는 일 ${String(kind)}`);
    }
    return { at: num(h, 'at'), kind, ids: nums(h, 'ids') };
  });
}

function deliveries(p: Record<string, unknown>): HttpWindowView['delivered'] {
  const value = p['delivered'];
  if (!Array.isArray(value)) throw new Error('http projector: delivered 가 배열이 아니다');
  return value.map((raw: unknown) => {
    const d = record(raw, 'delivered');
    return { id: num(d, 'id'), born: num(d, 'born'), at: num(d, 'at') };
  });
}

export const httpProjector: ProjectorFactory = (views, runtime) => {
  const stage = views['stage'] as unknown as HttpStage | undefined;
  const codePanel = views['codePanel'] as unknown as CodePanel | undefined;
  const motion = (): number => {
    const speed = runtime?.getSpeed() ?? 1;
    return MOTION_MS / (speed > 0 ? speed : 1);
  };

  return {
    async onEvent(event: FacetRuntimeEvent) {
      const p = event.payload;
      switch (event.type) {
        case 'run-start': {
          const r = record(p, 'run-start');
          const mode = r['mode'];
          if (mode !== 'poll' && mode !== 'websocket') throw new Error(`http projector: 모르는 mode ${String(mode)}`);
          codePanel?.clearHighlight?.();
          await stage?.startRun(
            {
              receive: num(r, 'receive'),
              mode,
              periodSec: num(r, 'periodSec'),
              pollTimes: nums(r, 'pollTimes'),
              births: nums(r, 'births'),
              horizonSec: num(r, 'horizonSec'),
              windowSec: num(r, 'windowSec'),
            },
            motion(),
          );
          return;
        }
        case 'upgrade': {
          const r = record(p, 'upgrade');
          await stage?.showUpgrade({ requestBytes: num(r, 'requestBytes'), responseBytes: num(r, 'responseBytes') }, motion());
          return;
        }
        case 'window': {
          const r = record(p, 'window');
          await stage?.playWindow(
            {
              index: num(r, 'index'),
              lo: num(r, 'lo'),
              hi: num(r, 'hi'),
              happenings: happenings(r),
              delivered: deliveries(r),
              pending: nums(r, 'pending'),
              requests: num(r, 'requests'),
              emptyResponses: num(r, 'emptyResponses'),
              delaySeconds: num(r, 'delaySeconds'),
              overheadBytes: num(r, 'overheadBytes'),
              wireBytes: num(r, 'wireBytes'),
            },
            motion(),
          );
          return;
        }
        case 'phase': {
          const r = record(p, 'phase');
          const phase = r['phase'];
          if (typeof phase !== 'string') throw new Error('http projector: phase 가 글자가 아니다');
          codePanel?.highlightPhase?.(phase);
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      stage?.reset();
      codePanel?.clearHighlight?.();
    },
  };
};
