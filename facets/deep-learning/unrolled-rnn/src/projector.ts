/**
 * 펼친 RNN projector — algorithm 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 *   init       → stage.init (걸음 0 을 갈아 끼운다) · 코드 패널 강조를 끈다
 *   phase      → codePanel.highlightPhase
 *   forward    → stage.forward
 *   backward   → stage.backward
 *   far-share  → stage.farShare
 *
 * 운동의 길이는 걸음마다 재생 속도를 읽어 정한다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { UnrolledRnnStage } from './unrolled-rnn-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void };

/** 한 걸음의 운동 길이 (속도 1 에서) — stepMs 650 안쪽. */
const MOTION_MS = 280;

function record(e: FacetRuntimeEvent): Record<string, unknown> {
  const p = e.payload;
  if (typeof p !== 'object' || p === null) {
    throw new Error(`[unrolledRnnProjector] ${e.type} 의 payload 가 객체가 아니다`);
  }
  return p as Record<string, unknown>;
}

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`[unrolledRnnProjector] ${type}.${key} 가 수가 아니다: ${String(v)}`);
  }
  return v;
}

function int(p: Record<string, unknown>, key: string, type: string): number {
  const v = num(p, key, type);
  if (!Number.isInteger(v)) throw new Error(`[unrolledRnnProjector] ${type}.${key} 가 정수가 아니다: ${v}`);
  return v;
}

function numList(p: Record<string, unknown>, key: string, type: string): number[] {
  const v = p[key];
  if (!Array.isArray(v)) throw new Error(`[unrolledRnnProjector] ${type}.${key} 가 목록이 아니다`);
  return v.map((item, i) => {
    if (typeof item !== 'number' || !Number.isFinite(item)) {
      throw new Error(`[unrolledRnnProjector] ${type}.${key}[${i}] 가 수가 아니다`);
    }
    return item;
  });
}

export const unrolledRnnProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as UnrolledRnnStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  const need = (): UnrolledRnnStage => {
    if (stage === undefined) throw new Error('[unrolledRnnProjector] stage 가 마운트되지 않았다');
    return stage;
  };
  const motion = (): number => MOTION_MS / (runtime ? runtime.getSpeed() : 1);

  return {
    onEvent(event) {
      switch (event.type) {
        case 'init': {
          const p = record(event);
          need().init({
            xs: numList(p, 'xs', 'init'),
            wx: num(p, 'wx', 'init'),
            b: num(p, 'b', 'init'),
            h0: num(p, 'h0', 'init'),
            wh: num(p, 'wh', 'init'),
            steps: int(p, 'steps', 'init'),
            sum: num(p, 'sum', 'init'),
          });
          codePanel?.highlightPhase(null);
          return;
        }
        case 'phase': {
          const phase = record(event).phase;
          if (typeof phase !== 'string') throw new Error('[unrolledRnnProjector] phase 이름이 문자열이 아니다');
          codePanel?.highlightPhase(phase);
          return;
        }
        case 'forward': {
          const p = record(event);
          const mult = p.mult;
          if (mult !== null && (typeof mult !== 'number' || !Number.isFinite(mult))) {
            throw new Error('[unrolledRnnProjector] forward.mult 가 수도 null 도 아니다');
          }
          need().forward(
            {
              tIndex: int(p, 'tIndex', 'forward'),
              x: num(p, 'x', 'forward'),
              a: num(p, 'a', 'forward'),
              h: num(p, 'h', 'forward'),
              trace: num(p, 'trace', 'forward'),
              mult,
              left: int(p, 'left', 'forward'),
            },
            motion(),
          );
          return;
        }
        case 'backward': {
          const p = record(event);
          need().backward(
            {
              k: int(p, 'k', 'backward'),
              x: num(p, 'x', 'backward'),
              reach: num(p, 'reach', 'backward'),
              slope: num(p, 'slope', 'backward'),
              d: num(p, 'd', 'backward'),
              contrib: num(p, 'contrib', 'backward'),
              sum: num(p, 'sum', 'backward'),
            },
            motion(),
          );
          return;
        }
        case 'far-share': {
          const p = record(event);
          need().farShare(
            {
              forwardTrace: num(p, 'forwardTrace', 'far-share'),
              backwardTrace: num(p, 'backwardTrace', 'far-share'),
              reachFirst: num(p, 'reachFirst', 'far-share'),
              share: num(p, 'share', 'far-share'),
              farCount: int(p, 'farCount', 'far-share'),
              sum: num(p, 'sum', 'far-share'),
            },
            motion(),
          );
          return;
        }
        default:
          throw new Error(`[unrolledRnnProjector] 모르는 이벤트: ${event.type}`);
      }
    },
  };
};
