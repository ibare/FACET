/**
 * 재시도와 백오프의 projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 *   init  → 무대 init (장애 바탕이 옮겨 가는 운동) · 코드 패널 강조 끔
 *   phase → 코드 패널 highlightPhase
 *   tick  → 무대 step (칸에 서기 → 받음은 서버로 · 실패는 다음 틱 기둥으로 날아감)
 *
 * 운동 길이는 motionMs / 지금 재생 속도 — 걸음마다 다시 읽는다.
 */
import type { ProjectorFactory, FacetRuntimeEvent } from '@ffacet/core/runtime';
import type { RetryStage, StageInit, StageTick, StageVisit } from './retry-and-backoff-stage.js';

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`retry-and-backoff: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function int(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`retry-and-backoff: ${key} 가 정수가 아니다`);
  return v;
}

function bool(o: Record<string, unknown>, key: string): boolean {
  const v = o[key];
  if (typeof v !== 'boolean') throw new Error(`retry-and-backoff: ${key} 가 참거짓이 아니다`);
  return v;
}

function str(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`retry-and-backoff: ${key} 가 글자가 아니다`);
  return v;
}

function readInit(payload: unknown): { init: StageInit; motionMs: number } {
  const o = obj(payload, 'init payload');
  return {
    init: {
      policyId: str(o, 'policyId'),
      outageFrom: int(o, 'outageFrom'),
      outageTo: int(o, 'outageTo'),
      cap: int(o, 'cap'),
      axisLastTick: int(o, 'axisLastTick'),
      axisMaxStack: int(o, 'axisMaxStack'),
    },
    motionMs: int(o, 'motionMs'),
  };
}

function readVisit(raw: unknown): StageVisit {
  const o = obj(raw, 'visit');
  const next = o.next;
  if (next !== null && (typeof next !== 'number' || !Number.isInteger(next))) {
    throw new Error('retry-and-backoff: visit.next 가 정수도 null 도 아니다');
  }
  return { id: str(o, 'id'), fresh: bool(o, 'fresh'), served: bool(o, 'served'), next };
}

function readTick(payload: unknown): StageTick {
  const o = obj(payload, 'tick payload');
  const visits = o.visits;
  if (!Array.isArray(visits)) throw new Error('retry-and-backoff: visits 가 목록이 아니다');
  return {
    tick: int(o, 'tick'),
    up: bool(o, 'up'),
    arrivals: int(o, 'arrivals'),
    served: int(o, 'served'),
    failed: int(o, 'failed'),
    visits: visits.map(readVisit),
  };
}

export const retryAndBackoffProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as RetryStage | undefined;
  if (stage === undefined) throw new Error('retry-and-backoff: stage 블록이 없다');
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  let motionMs: number | null = null;

  const motion = (): number => {
    if (motionMs === null) throw new Error('retry-and-backoff: init 앞에 걸음이 왔다');
    const speed = runtime ? runtime.getSpeed() : 1;
    return motionMs / Math.max(0.01, speed);
  };

  return {
    onEvent(event: FacetRuntimeEvent): void {
      switch (event.type) {
        case 'init': {
          const { init, motionMs: ms } = readInit(event.payload);
          motionMs = ms;
          codePanel?.highlightPhase(null);
          stage.init(init, motion());
          return;
        }
        case 'phase': {
          const p = obj(event.payload, 'phase payload');
          codePanel?.highlightPhase(str(p, 'phase'));
          return;
        }
        case 'tick': {
          stage.step(readTick(event.payload), motion());
          return;
        }
        default:
          throw new Error(`retry-and-backoff: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset(): void {
      motionMs = null;
      stage.reset();
      codePanel?.clearHighlight();
    },
  };
};
