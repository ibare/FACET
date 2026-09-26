/**
 * diffusion projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * payload 는 typeof 가드로 읽고, 모양이 어긋나면 던진다. 운동 길이는 걸음 길이에 지금 재생 속도를 나눠
 * 그때그때 셈한다 (운동이 걸음 경계를 넘지 않게).
 */

import type { ProjectorFactory } from '@ffacet/core/runtime';
import type { DiffusionStage, Pt } from './diffusion-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void; clearHighlight(): void };

/** 운동이 걸음 길이 안에서 끝나게 — 걸음의 이만큼만 쓴다. */
const MOTION_SHARE = 0.8;

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`diffusion projector: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}
function num(o: Record<string, unknown>, k: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`diffusion projector: ${k} 가 수가 아니다`);
  return v;
}
function point(v: unknown, what: string): Pt {
  if (!Array.isArray(v) || v.length !== 2) throw new Error(`diffusion projector: ${what} 가 두 성분 점이 아니다`);
  const [x, y] = v as unknown[];
  if (typeof x !== 'number' || typeof y !== 'number') throw new Error(`diffusion projector: ${what} 의 성분이 수가 아니다`);
  return [x, y];
}
function points(o: Record<string, unknown>, k: string): Pt[] {
  const v = o[k];
  if (!Array.isArray(v)) throw new Error(`diffusion projector: ${k} 가 목록이 아니다`);
  return v.map((p, i) => point(p, `${k}[${i}]`));
}
function numbers(o: Record<string, unknown>, k: string): number[] {
  const v = o[k];
  if (!Array.isArray(v) || !v.every((n) => typeof n === 'number')) throw new Error(`diffusion projector: ${k} 가 수 목록이 아니다`);
  return v as number[];
}
function booleans(o: Record<string, unknown>, k: string): boolean[] {
  const v = o[k];
  if (!Array.isArray(v) || !v.every((n) => typeof n === 'boolean')) throw new Error(`diffusion projector: ${k} 가 참거짓 목록이 아니다`);
  return v as boolean[];
}
function sides(o: Record<string, unknown>, k: string): ('P' | 'Q')[] {
  const v = o[k];
  if (!Array.isArray(v) || !v.every((n) => n === 'P' || n === 'Q')) throw new Error(`diffusion projector: ${k} 가 P · Q 목록이 아니다`);
  return v as ('P' | 'Q')[];
}

export const diffusionProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as DiffusionStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  if (!stage) throw new Error('diffusion projector: stage 가 없다');

  const motion = (durationMs: number): number => {
    const speed = runtime ? runtime.getSpeed() : 1;
    if (!(speed > 0)) throw new Error('diffusion projector: 재생 속도가 양수가 아니다');
    return (durationMs * MOTION_SHARE) / speed;
  };

  return {
    onEvent(event) {
      switch (event.type) {
        case 'diffusion-init': {
          const p = rec(event.payload, 'diffusion-init');
          const pl = rec(p.plane, 'plane');
          stage.init({
            plane: { xMin: num(pl, 'xMin'), xMax: num(pl, 'xMax'), yMin: num(pl, 'yMin'), yMax: num(pl, 'yMax') },
            dataP: point(p.dataP, 'dataP'),
            dataQ: point(p.dataQ, 'dataQ'),
            sampleCount: num(p, 'sampleCount'),
          });
          return;
        }
        case 'round-start': {
          const p = rec(event.payload, 'round-start');
          code?.highlightPhase(null);
          stage.startRound({
            steps: num(p, 'steps'),
            beta: num(p, 'beta'),
            xT: points(p, 'xT'),
            motionMs: motion(num(p, 'durationMs')),
          });
          return;
        }
        case 'reverse-step': {
          const p = rec(event.payload, 'reverse-step');
          stage.reverseStep({
            tIndex: num(p, 'tIndex'),
            tNext: num(p, 'tNext'),
            x0Hat: points(p, 'x0Hat'),
            xPrev: points(p, 'xPrev'),
            motionMs: motion(num(p, 'durationMs')),
          });
          return;
        }
        case 'settle-read': {
          const p = rec(event.payload, 'settle-read');
          stage.settle({
            distance: numbers(p, 'distance'),
            nearest: sides(p, 'nearest'),
            reached: booleans(p, 'reached'),
            reachedCount: num(p, 'reachedCount'),
            motionMs: motion(num(p, 'durationMs')),
          });
          return;
        }
        case 'phase': {
          const p = rec(event.payload, 'phase');
          const phase = p.phase;
          if (typeof phase !== 'string') throw new Error('diffusion projector: phase 가 글자가 아니다');
          code?.highlightPhase(phase);
          return;
        }
        default:
          throw new Error(`diffusion projector: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      code?.clearHighlight();
      stage.clear();
    },
  };
};
