/**
 * momentum projector — start · update 를 무대 호출로, phase 를 코드 패널 강조로 옮긴다.
 *
 * 운동 길이는 걸음 간격의 60% 를 지금 재생 속도로 나눈 값이다 (걸음마다 `getSpeed()` 를 다시 읽는다).
 * 무대 운동을 기다리지 않는다 — 운동은 알고리즘의 sleep 안에서 끝난다.
 */
import type { ProjectorFactory, ViewInstance } from '@ffacet/core/runtime';
import type { MomentumStart, MomentumStep, MomentumSummary, Zone } from './algorithm.js';
import type { MomentumStageApi } from './momentum-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void };

const MOTION_SHARE = 0.6;

function rec(x: unknown, what: string): Record<string, unknown> {
  if (typeof x !== 'object' || x === null) throw new Error(`momentum projector: ${what} 가 객체가 아니다`);
  return x as Record<string, unknown>;
}
function num(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`momentum projector: ${key} 가 수가 아니다`);
  return v;
}
function numOrNull(o: Record<string, unknown>, key: string): number | null {
  const v = o[key];
  if (v === null) return null;
  return num(o, key);
}
function zoneOfPayload(o: Record<string, unknown>): Zone {
  const v = o.zone;
  if (v === 'slope' || v === 'flat' || v === 'bowl') return v;
  throw new Error(`momentum projector: 모르는 구간 ${String(v)}`);
}

function readStart(payload: unknown): MomentumStart {
  const o = rec(payload, 'start payload');
  return {
    beta: num(o, 'beta'),
    eta: num(o, 'eta'),
    steps: num(o, 'steps'),
    stepMs: num(o, 'stepMs'),
    w0: num(o, 'w0'),
    v0: num(o, 'v0'),
    loss0: num(o, 'loss0'),
    flatFrom: num(o, 'flatFrom'),
    bowlFrom: num(o, 'bowlFrom'),
    bottom: num(o, 'bottom'),
    settleBand: num(o, 'settleBand'),
    axisTop: num(o, 'axisTop'),
    moveScale: num(o, 'moveScale'),
  };
}

function readSummary(x: unknown): MomentumSummary {
  const o = rec(x, 'summary');
  return {
    crossAt: numOrNull(o, 'crossAt'),
    farW: num(o, 'farW'),
    farAt: num(o, 'farAt'),
    overshoot: numOrNull(o, 'overshoot'),
    settleAt: numOrNull(o, 'settleAt'),
    endW: num(o, 'endW'),
    endL: num(o, 'endL'),
  };
}

function readStep(payload: unknown): MomentumStep {
  const o = rec(payload, 'update payload');
  const final = o.final;
  if (typeof final !== 'boolean') throw new Error('momentum projector: final 이 참거짓이 아니다');
  const step: MomentumStep = {
    t: num(o, 't'),
    wPrev: num(o, 'wPrev'),
    w: num(o, 'w'),
    loss: num(o, 'loss'),
    zone: zoneOfPayload(o),
    carried: num(o, 'carried'),
    pushed: num(o, 'pushed'),
    v: num(o, 'v'),
    plateau: num(o, 'plateau'),
    pastBottom: num(o, 'pastBottom'),
    final,
  };
  if (final) step.summary = readSummary(o.summary);
  return step;
}

export const momentumProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as MomentumStageApi | undefined;
  if (stage === undefined) throw new Error('momentum projector: stage view 가 없다');
  const code = views.codePanel as (ViewInstance & CodePanel) | undefined;
  let stepMs: number | null = null;

  return {
    onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const phase = rec(event.payload, 'phase payload').phase;
          if (typeof phase !== 'string') throw new Error('momentum projector: phase 가 글자가 아니다');
          code?.highlightPhase(phase);
          return;
        }
        case 'start': {
          const p = readStart(event.payload);
          stepMs = p.stepMs;
          code?.highlightPhase(null);
          stage.start(p);
          return;
        }
        case 'update': {
          if (stepMs === null) throw new Error('momentum projector: start 전에 update 가 왔다');
          const speed = runtime?.getSpeed() ?? 1;
          stage.update(readStep(event.payload), (stepMs * MOTION_SHARE) / (speed > 0 ? speed : 1));
          return;
        }
        default:
          throw new Error(`momentum projector: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      code?.highlightPhase(null);
      stage.reset();
    },
  };
};
