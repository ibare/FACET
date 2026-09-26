/**
 * mdp projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 * 문안은 무대가 그린다 (projector 는 번역하지 않는다). payload 는 typeof 로 읽고, 어긋나면 던진다. 운동 길이는 걸음 길이를 재생 속도로 나눠 그때그때 셈한다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { MdpStage } from './mdp-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void };

function obj(p: unknown): Record<string, unknown> {
  if (typeof p !== 'object' || p === null) throw new Error('[mdp] payload 가 객체가 아니다');
  return p as Record<string, unknown>;
}

function num(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`[mdp] payload.${key} 가 수가 아니다`);
  return v;
}

function str(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`[mdp] payload.${key} 가 글이 아니다`);
  return v;
}

function nums(o: Record<string, unknown>, key: string): number[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`[mdp] payload.${key} 가 배열이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`[mdp] payload.${key} 에 수 아닌 것이 있다`);
    return x;
  });
}

/** 걸음 길이 가운데 운동이 차지하는 몫 — 나머지는 멈춰 읽는 시간 */
const MOTION_SHARE = 0.6;

export const mdpProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as MdpStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  let stepMs: number | null = null;

  const motion = (): number => {
    if (stepMs === null) throw new Error('[mdp] 판이 시작되지 않았다');
    const speed = runtime?.getSpeed() ?? 1;
    return Math.round((stepMs * MOTION_SHARE) / Math.max(0.01, speed));
  };

  return {
    onEvent(event: FacetRuntimeEvent) {
      const p = event.payload;
      switch (event.type) {
        case 'phase': {
          const phase = obj(p).phase;
          if (typeof phase !== 'string') throw new Error('[mdp] phase 가 글이 아니다');
          code?.highlightPhase(phase);
          return;
        }
        case 'run-start': {
          const o = obj(p);
          stepMs = num(o, 'stepMs');
          stage?.startRun({
            gamma: num(o, 'gamma'),
            slip: num(o, 'slip'),
            rows: num(o, 'rows'),
            cols: num(o, 'cols'),
            kinds: nums(o, 'kinds'),
            rewards: nums(o, 'rewards'),
            start: num(o, 'start'),
            sweeps: num(o, 'sweeps'),
            valueScale: num(o, 'valueScale'),
            motionMs: motion(),
          });
          return;
        }
        case 'sweep': {
          const o = obj(p);
          stage?.showSweep({
            sweep: num(o, 'sweep'),
            values: nums(o, 'values'),
            policy: nums(o, 'policy'),
            turned: nums(o, 'turned'),
            change: num(o, 'change'),
            startValue: num(o, 'startValue'),
            nonZero: num(o, 'nonZero'),
            motionMs: motion(),
          });
          return;
        }
        case 'path': {
          const o = obj(p);
          stage?.showPath({
            moves: num(o, 'moves'),
            cells: nums(o, 'cells'),
            arrows: str(o, 'arrows'),
            endKind: num(o, 'endKind'),
            motionMs: motion(),
          });
          return;
        }
        default:
          throw new Error(`[mdp] 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      stepMs = null;
    },
  };
};
