/**
 * adam projector — round / update 를 무대의 두 축 막대로, phase 를 코드 패널로 옮긴다.
 * 운동 길이는 걸음(stepMs)의 60% 를 지금 재생 속도로 나눈 값 — 그때그때 getSpeed() 를 읽는다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { AdamRoundView, AdamStage, AdamUpdateView } from './adam-stage.js';

type CodePanel = {
  highlightPhase?: (phase: string | null) => void;
  clearHighlight?: () => void;
};

const MOTION_SHARE = 0.6;

function obj(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) throw new Error('adam projector: payload 가 객체가 아니다');
  return payload as Record<string, unknown>;
}

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`adam projector: ${key} 가 수가 아니다`);
  return v;
}

function str(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`adam projector: ${key} 가 글자가 아니다`);
  return v;
}

function bool(p: Record<string, unknown>, key: string): boolean {
  const v = p[key];
  if (typeof v !== 'boolean') throw new Error(`adam projector: ${key} 가 참거짓이 아니다`);
  return v;
}

function readRound(payload: unknown): AdamRoundView {
  const p = obj(payload);
  const rule = str(p, 'rule');
  if (rule !== 'gd' && rule !== 'adam') throw new Error(`adam projector: 모르는 규칙 ${rule}`);
  return {
    rule,
    ratio: num(p, 'ratio'),
    eta: num(p, 'eta'),
    coefA: num(p, 'coefA'),
    coefB: num(p, 'coefB'),
    coefBText: str(p, 'coefBText'),
    steps: num(p, 'steps'),
    a: num(p, 'a'),
    b: num(p, 'b'),
  };
}

function readUpdate(payload: unknown): AdamUpdateView {
  const p = obj(payload);
  return {
    t: num(p, 't'),
    steps: num(p, 'steps'),
    a: num(p, 'a'),
    b: num(p, 'b'),
    aShare: num(p, 'aShare'),
    bShare: num(p, 'bShare'),
    aFrac: num(p, 'aFrac'),
    bFrac: num(p, 'bFrac'),
    last: bool(p, 'last'),
  };
}

export const adamProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as AdamStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  let stepMs: number | null = null;

  const motionMs = () => {
    if (stepMs === null) return 0;
    const speed = runtime?.getSpeed() ?? 1;
    return (stepMs * MOTION_SHARE) / Math.max(0.01, speed);
  };

  return {
    onInit(initialData) {
      const d = obj(initialData);
      stepMs = num(d, 'stepMs');
      stage?.reset();
      code?.highlightPhase?.(null);
    },
    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'phase': {
          const p = obj(event.payload);
          code?.highlightPhase?.(str(p, 'phase'));
          return;
        }
        case 'round': {
          code?.highlightPhase?.(null);
          stage?.showRound(readRound(event.payload), motionMs());
          return;
        }
        case 'update': {
          stage?.showUpdate(readUpdate(event.payload), motionMs());
          return;
        }
        default:
          throw new Error(`adam projector: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      stage?.reset();
      code?.highlightPhase?.(null);
    },
    onDestroy() {
      stage?.reset();
    },
  };
};
