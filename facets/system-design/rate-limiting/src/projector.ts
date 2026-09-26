/**
 * 레이트 리미팅 projector — `init` · `tick` · `phase` 를 무대와 코드 패널에 옮긴다.
 *
 * payload 는 typeof 가드로 읽고, 모양이 어긋나면 무엇이 없는지 담아 던진다.
 * 운동 길이는 재생 속도를 그때그때 읽어 줄인다 (속도 2 면 절반).
 */

import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import { MOTION_MS } from './algorithm.js';
import type { RateLimitingStage, StageInit, StageTick } from './rate-limiting-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void; clearHighlight(): void };

function record(payload: unknown, what: string): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) throw new Error(`rate-limiting: ${what} payload 가 없다`);
  return payload as Record<string, unknown>;
}

function int(p: Record<string, unknown>, key: string, what: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`rate-limiting: ${what}.${key} 가 정수가 아니다`);
  return v;
}

function ints(p: Record<string, unknown>, key: string, what: string): number[] {
  const v = p[key];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number' && Number.isInteger(x))) {
    throw new Error(`rate-limiting: ${what}.${key} 가 정수 배열이 아니다`);
  }
  return v as number[];
}

function readInit(payload: unknown): StageInit {
  const p = record(payload, 'init');
  return {
    method: int(p, 'method', 'init'),
    burst: int(p, 'burst', 'init'),
    axisEnd: int(p, 'axisEnd', 'init'),
    maxStack: int(p, 'maxStack', 'init'),
    maxBurst: int(p, 'maxBurst', 'init'),
    startFill: int(p, 'startFill', 'init'),
    arriveTick: ints(p, 'arriveTick', 'init'),
  };
}

function readTick(payload: unknown): StageTick {
  const p = record(payload, 'tick');
  const w = p.window;
  let window: StageTick['window'];
  if (w === null) window = null;
  else {
    const wr = record(w, 'tick.window');
    window = { start: int(wr, 'start', 'tick.window'), end: int(wr, 'end', 'tick.window') };
  }
  return {
    tick: int(p, 'tick', 'tick'),
    arrived: ints(p, 'arrived', 'tick'),
    passed: ints(p, 'passed', 'tick'),
    rejected: ints(p, 'rejected', 'tick'),
    queued: ints(p, 'queued', 'tick'),
    bucket: ints(p, 'bucket', 'tick'),
    fill: int(p, 'fill', 'tick'),
    window,
    peakStart: int(p, 'peakStart', 'tick'),
  };
}

export const rateLimitingProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as RateLimitingStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const need = (): RateLimitingStage => {
    if (stage === undefined) throw new Error('rate-limiting: stage 블록이 없다');
    return stage;
  };
  const motion = (): number => {
    const speed = runtime === undefined ? 1 : runtime.getSpeed();
    if (!(speed > 0)) throw new Error(`rate-limiting: 재생 속도 ${speed} 가 양수가 아니다`);
    return MOTION_MS / speed;
  };

  return {
    onEvent(event: FacetRuntimeEvent): void {
      switch (event.type) {
        case 'phase': {
          const p = record(event.payload, 'phase');
          const name = p.phase;
          if (typeof name !== 'string') throw new Error('rate-limiting: phase.phase 가 문자열이 아니다');
          code?.highlightPhase(name);
          return;
        }
        case 'init':
          code?.highlightPhase(null);
          need().init(readInit(event.payload));
          return;
        case 'tick':
          need().tick(readTick(event.payload), motion());
          return;
        default:
          throw new Error(`rate-limiting: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset(): void {
      stage?.reset();
      code?.clearHighlight();
    },
  };
};
