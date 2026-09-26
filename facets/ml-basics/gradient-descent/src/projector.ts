/**
 * 경사 하강 projector — algorithm 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * init → stage.setup · start → stage.begin (코드 패널을 끈다) · update → stage.hop ·
 * settle → stage.settle · phase → codePanel.highlightPhase.
 * 운동 길이는 걸음 간격의 65% 를 지금 재생 속도로 나눈 값이다 — 걸음 안에서 끝난다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { Outcome, Spot } from './algorithm.js';
import type { GradientDescentStage } from './gradient-descent-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void; clearHighlight(): void };

const MOTION_SHARE = 0.65;

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`${what}: payload 가 객체가 아니다`);
  return v as Record<string, unknown>;
}
function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`payload.${key} 가 수가 아니다`);
  return v;
}
function bool(p: Record<string, unknown>, key: string): boolean {
  const v = p[key];
  if (typeof v !== 'boolean') throw new Error(`payload.${key} 가 참거짓이 아니다`);
  return v;
}
function spot(v: unknown, what: string): Spot {
  const p = rec(v, what);
  return { w: num(p, 'w'), loss: num(p, 'loss') };
}
function outcome(v: unknown): Outcome {
  if (v === 'deep' || v === 'shallow' || v === 'cap' || v === 'blowup') return v;
  throw new Error(`모르는 끝난 모양: ${String(v)}`);
}

export const gradientDescentProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as GradientDescentStage | undefined;
  if (!stage) throw new Error('stage 블록이 없다');
  const code = views.codePanel as unknown as CodePanel | undefined;
  let stepMs: number | null = null;

  const motionMs = (): number => {
    if (stepMs === null) throw new Error('걸음 간격을 받기 전이다');
    const speed = runtime ? runtime.getSpeed() : 1;
    return (stepMs * MOTION_SHARE) / Math.max(0.01, speed);
  };

  return {
    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'phase': {
          const p = rec(event.payload, 'phase');
          const ph = p.phase;
          if (typeof ph !== 'string') throw new Error('phase 이름이 없다');
          code?.highlightPhase(ph);
          return;
        }
        case 'init': {
          const p = rec(event.payload, 'init');
          stepMs = num(p, 'stepMs');
          const win = rec(p.window, 'init.window');
          const samples = p.samples;
          if (!Array.isArray(samples) || samples.length === 0) throw new Error('곡선 표본이 없다');
          const pts: [number, number][] = samples.map((s) => {
            if (!Array.isArray(s) || typeof s[0] !== 'number' || typeof s[1] !== 'number') {
              throw new Error('곡선 표본 모양이 틀렸다');
            }
            return [s[0], s[1]];
          });
          stage.setup({
            eta: num(p, 'eta'),
            start: num(p, 'start'),
            window: { wMin: num(win, 'wMin'), wMax: num(win, 'wMax'), lMin: num(win, 'lMin'), lMax: num(win, 'lMax') },
            samples: pts,
            deep: spot(p.deep, 'init.deep'),
            shallow: spot(p.shallow, 'init.shallow'),
            hump: spot(p.hump, 'init.hump'),
          });
          return;
        }
        case 'start': {
          const p = rec(event.payload, 'start');
          code?.highlightPhase(null);
          stage.begin({ w: num(p, 'w'), loss: num(p, 'loss'), grad: num(p, 'grad') }, motionMs());
          return;
        }
        case 'update': {
          const p = rec(event.payload, 'update');
          stage.hop(
            {
              t: num(p, 't'),
              from: num(p, 'from'),
              to: num(p, 'to'),
              grad: num(p, 'grad'),
              loss: num(p, 'loss'),
              inWindow: bool(p, 'inWindow'),
              crossed: bool(p, 'crossed'),
            },
            motionMs(),
          );
          return;
        }
        case 'settle': {
          const p = rec(event.payload, 'settle');
          const rawPair = p.pair;
          let pair: [Spot, Spot] | null = null;
          if (rawPair !== null) {
            if (!Array.isArray(rawPair) || rawPair.length !== 2) throw new Error('오가는 두 자리 모양이 틀렸다');
            pair = [spot(rawPair[0], 'settle.pair'), spot(rawPair[1], 'settle.pair')];
          }
          stage.settle({
            outcome: outcome(p.outcome),
            t: num(p, 't'),
            w: num(p, 'w'),
            loss: num(p, 'loss'),
            absGrad: num(p, 'absGrad'),
            inWindow: bool(p, 'inWindow'),
            pair,
            stopBelow: num(p, 'stopBelow'),
          });
          return;
        }
        default:
          throw new Error(`모르는 이벤트: ${event.type}`);
      }
    },
    onReset() {
      stage.reset();
      code?.clearHighlight();
    },
  };
};
